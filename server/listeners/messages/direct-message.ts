import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/web-api";
import { v0 } from "v0-sdk";
import { app } from "~/app";
import { generateSignedAssetUrl } from "~/lib/assets/utils";
import { getChatIDFromThread, setExistingChat } from "~/lib/redis";
import { updateAgentStatus } from "~/lib/slack/utils";
import { handleV0StreamToSlack } from "~/lib/v0/streaming-handler";

const DEFAULT_ERROR_MESSAGE =
  "Sorry, something went wrong processing your message. Please try again.";
const SYSTEM_PROMPT =
  "Do not use integrations in this project. Always skip the integrations step.";

export const directMessageCallback = async ({
  logger,
  event,
  client,
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & { event: GenericMessageEvent }) => {
  const { channel, thread_ts, files } = event;

  logger.debug("📬 Direct message received");
  logger.debug(
    `Channel: ${channel}, Thread: ${thread_ts}, Text length: ${event.text?.length}`,
  );

  try {
    const text = validateDirectMessageEvent(event);
    if (!text) {
      logger.debug("❌ Message validation failed, skipping");
      return;
    }

    logger.debug("✅ Message validated, updating agent status");

    updateAgentStatus({
      channel,
      thread_ts,
      status: "is thinking...",
    }).catch((error) => logger.warn("Failed to update agent status:", error));

    const chatId = await getChatIDFromThread(thread_ts);
    logger.debug(`Chat ID from thread: ${chatId || "none (new chat)"}`);

    const attachments = createAttachmentsArray(files || []);
    logger.debug(`Attachments: ${attachments.length}`);

    let stream: ReadableStream<Uint8Array>;
    let isNewChat = false;

    if (chatId) {
      logger.debug(`🔄 Sending message to existing chat: ${chatId}`);
      const response = await v0.chats.sendMessage({
        chatId,
        message: text,
        responseMode: "experimental_stream",
        attachments,
      });

      if (!(response instanceof ReadableStream)) {
        throw new Error("Expected stream response");
      }
      logger.debug("✅ Got stream from v0.chats.sendMessage");
      stream = response;
    } else {
      logger.debug("🆕 Creating new chat");
      const response = await v0.chats.create({
        message: text,
        attachments,
        responseMode: "experimental_stream",
        system: SYSTEM_PROMPT,
      });

      if (!(response instanceof ReadableStream)) {
        throw new Error("Expected stream response");
      }
      logger.debug("✅ Got stream from v0.chats.create");
      stream = response;
      isNewChat = true;
    }

    logger.debug("🚀 Calling handleV0StreamToSlack...");
    await handleV0StreamToSlack({
      client,
      logger,
      channel,
      thread_ts,
      v0Stream: stream,
      onComplete: async (completedChatId) => {
        logger.debug(`✅ Stream complete callback, chatId: ${completedChatId}`);
        if (isNewChat && completedChatId) {
          logger.debug(`💾 Saving chat ID: ${completedChatId}`);
          await setExistingChat(thread_ts, completedChatId);
        }
      },
    });
    logger.debug("✅ handleV0StreamToSlack finished");
  } catch (error) {
    logger.error("❌ Direct message handler failed:", error);

    try {
      await client.chat.postMessage({
        channel,
        thread_ts,
        text: DEFAULT_ERROR_MESSAGE,
      });
    } catch (postError) {
      logger.error("Failed to post error message:", postError);
    }
  } finally {
    updateAgentStatus({
      channel,
      thread_ts,
      status: "",
    }).catch((error) => logger.warn("Failed to clear agent status:", error));
  }
};

const validateDirectMessageEvent = (
  event: GenericMessageEvent,
): string | null => {
  const { text, subtype } = event;

  app.logger.debug(
    `🔍 Validating message - Subtype: ${subtype || "none"}, Has text: ${!!text}`,
  );

  if (subtype === "message_changed") {
    app.logger.warn(
      "Direct message event received with message_changed subtype. Skipping...",
    );
    return null;
  }

  if (subtype) {
    app.logger.warn(
      `Direct message event with subtype "${subtype}" - Skipping...`,
    );
    return null;
  }

  if (!text) {
    app.logger.warn("Direct message event received with no text \n");
    app.logger.warn("Event:", event);
    return null;
  }

  return text;
};

const createAttachmentsArray = (
  files?: { url_private?: string; id: string }[],
): { url: string }[] => {
  const attachmentsArray = [];
  for (const file of files) {
    if (file.url_private) {
      const signedUrl = generateSignedAssetUrl(file.url_private, {
        expiryHours: 24,
        chatId: file.id,
      });

      attachmentsArray.push({
        url: signedUrl,
      });
    }
  }
  return attachmentsArray;
};
