import type {
  AllMiddlewareArgs,
  SayFn,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import type { ActionsBlockElement, GenericMessageEvent } from "@slack/web-api";
import { v0 } from "v0-sdk";
import { app } from "~/app";

import { proxySlackUrl } from "~/lib/assets/utils";
import { getChatIDFromThread, setExistingChat } from "~/lib/redis";
import { SignInBlock } from "~/lib/slack/ui/blocks";
import { updateAgentStatus } from "~/lib/slack/utils";
import { handleV0StreamToSlack } from "~/lib/v0/streaming-handler";
import { chatsCreate, chatsSendMessage } from "~/lib/v0/client";
import { cleanV0Stream } from "~/lib/v0/utils";

export const DEFAULT_ERROR_MESSAGE =
  "Sorry, something went wrong processing your message. Please try again.";
export const SYSTEM_PROMPT =
  "Do not use integrations in this project. Always skip the integrations step.";

export const directMessageCallback = async ({
  say,
  message,
  logger,
  event,
  client,
  context,
  body,
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & { event: GenericMessageEvent }) => {
  app.logger.info("Direct message event received", {
    event,
  });

  const { channel, thread_ts, files } = event;
  const { session, isNewChat, chatId } = context;
  const appId = body.api_app_id;

  // we only support message events from users. Subtypes can be seen here: https://docs.slack.dev/reference/events/message/
  if (message.subtype && message.subtype !== "file_share") {
    logger.warn("Direct message event received with subtype. Skipping...", {
      subtype: message.subtype,
    });
    return;
  }

  // Use event.text instead of message.text, since message.text may not exist on all event types
  if (!event.text) {
    logger.warn("Direct message event received with no text. Skipping...", {
      event,
    });
    return;
  }

  app.logger.info("Processing direct message event with context", {
    context,
    appId,
  });

  logger.debug("📬 Direct message received");
  logger.debug(
    `Channel: ${channel}, Thread: ${thread_ts}, Text length: ${event.text?.length}`,
  );

  try {
    app.logger.info("Updating agent status", {
      channel,
      thread_ts,
      status: "is thinking...",
    });

    await updateAgentStatus({
      channel,
      thread_ts,
      status: "is thinking...",
    }).catch((error) => logger.warn("Failed to update agent status:", error));

    if (!session) {
      app.logger.info("Posting ephemeral message to sign in", {
        channel,
        user: context.userId,
        thread_ts,
      });
      await client.chat.postEphemeral({
        channel,
        user: context.userId,
        blocks: [
          SignInBlock({ user: context.userId, teamId: context.teamId, appId }),
        ],
        text: "Please sign in to continue.",
        thread_ts,
      });
      return;
    }

    const existingChatId = await getChatIDFromThread(thread_ts);
    logger.debug(`Chat ID from thread: ${existingChatId || "none (new chat)"}`);

    const attachments = createAttachmentsArray(files || []);
    app.logger.info("Creating attachments array for direct message", {
      attachments,
      thread_ts,
      channel,
    });

    if (attachments.length > 0) {
      await updateAgentStatus({
        channel,
        thread_ts,
        status: "is reading attachments...",
      }).catch((error) => logger.warn("Failed to update agent status:", error));
    }

    let stream: ReadableStream<Uint8Array>;
    const isNewChatStream = !existingChatId;

    if (existingChatId) {
      logger.debug(`🔄 Sending message to existing chat: ${existingChatId}`);
      const response = await v0.chats.sendMessage({
        chatId: existingChatId,
        message: event.text,
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
        message: event.text,
        attachments,
        responseMode: "experimental_stream",
        system: SYSTEM_PROMPT,
      });

      if (!(response instanceof ReadableStream)) {
        throw new Error("Expected stream response");
      }
      logger.debug("✅ Got stream from v0.chats.create");
      stream = response;
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
        if (isNewChatStream && completedChatId) {
          logger.debug(`💾 Saving chat ID: ${completedChatId}`);
          await setExistingChat(thread_ts, completedChatId);
        }
      },
    });
    logger.debug("✅ handleV0StreamToSlack finished");
  } catch (error) {
    logger.error("❌ Direct message handler failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;

    await say({
      text: errorMessage,
      thread_ts,
    });
  } finally {
    app.logger.info("Clearing agent status", {
      channel,
      thread_ts,
    });
    // this will clear the status
    updateAgentStatus({
      channel,
      thread_ts,
      status: "",
    }).catch((error) => logger.warn("Failed to clear agent status:", error));
  }
};

const sendChatResponseToSlack = async (
  say: SayFn,
  cleanedChat: string,
  thread_ts: string,
  webUrl?: string,
  demoUrl?: string,
): Promise<void> => {
  app.logger.info("Sending chat response to Slack", {
    webUrl,
    demoUrl,
    cleanedChat,
  });
  const actions: ActionsBlockElement[] = [];

  if (webUrl) {
    actions.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Open in v0",
      },
      url: webUrl,
      action_id: "open_in_v0_action",
      value: webUrl,
    });
  }
  if (demoUrl) {
    actions.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "View demo",
      },
      url: demoUrl,
      action_id: "view_demo_action",
      value: demoUrl,
    });
  }

  await say({
    blocks: [
      {
        type: "markdown",
        text: cleanedChat,
      },
      {
        type: "actions",
        elements: actions,
      },
    ],
    text: cleanedChat,
    thread_ts,
  });
  app.logger.info("Chat response sent to Slack", {
    webUrl,
    demoUrl,
    cleanedChat,
  });
};

const createAttachmentsArray = (
  files?: { url_private?: string; id: string; mimetype?: string }[],
): { url: string }[] => {
  const attachmentsArray = [];
  for (const file of files) {
    if (file.url_private) {
      const proxyUrl = proxySlackUrl(file.url_private);

      attachmentsArray.push({
        url: proxyUrl,
      });
    }
  }
  return attachmentsArray;
};