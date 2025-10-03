import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { AppMentionEvent } from "@slack/web-api";
import { generateText } from "ai";
import { v0 } from "v0-sdk";
import { app } from "~/app";
import { generateSignedAssetUrl } from "~/lib/assets/utils";
import { getChatIDFromThread, setExistingChat } from "~/lib/redis";
import {
  getMessagesFromEvent,
  isV0ChatUrl,
  MessageState,
  type SlackUIMessage,
  tryGetChatIdFromV0Url,
  updateAgentStatus,
} from "~/lib/slack/utils";
import { handleV0StreamToSlack } from "~/lib/v0/streaming-handler";

export const appMentionCallback = async ({
  event,
  client,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  const { channel, thread_ts, ts } = event;

  logger.debug("📢 App mention received");
  logger.debug(`Channel: ${channel}, Thread: ${thread_ts}, TS: ${ts}`);

  updateAppMentionStatus(event);

  try {
    logger.debug("📨 Getting messages from event...");
    const messages = await getMessagesFromEvent(event);
    logger.debug(`Got ${messages.length} messages`);

    logger.debug("🔄 Creating prompt and resolving chat ID...");
    const [prompt, attachments, chatId] = await Promise.all([
      createPromptFromMessages(messages),
      createAttachmentsArray(messages),
      resolveChatId(messages, thread_ts),
    ]);
    logger.debug(`Prompt: ${prompt.substring(0, 100)}...`);
    logger.debug(
      `Attachments: ${attachments.length}, Chat ID: ${chatId || "none"}`,
    );

    let stream: ReadableStream<Uint8Array>;

    if (chatId) {
      logger.debug(`🔄 Sending to existing chat: ${chatId}`);
      await setExistingChat(thread_ts, chatId);
      const response = await v0.chats.sendMessage({
        chatId,
        message: prompt,
        responseMode: "experimental_stream",
        attachments: attachments,
      });

      if (!(response instanceof ReadableStream)) {
        throw new Error("Expected stream response");
      }
      logger.debug("✅ Got stream from v0.chats.sendMessage");
      stream = response;
    } else {
      logger.debug("🆕 Creating new chat");
      const response = await v0.chats.create({
        message: prompt,
        responseMode: "experimental_stream",
        attachments: attachments,
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
      thread_ts: thread_ts || ts,
      v0Stream: stream,
      onComplete: async (completedChatId) => {
        logger.debug(`✅ Stream complete, chat ID: ${completedChatId}`);
        if (completedChatId) {
          logger.debug(`💾 Saving chat ID: ${completedChatId}`);
          await setExistingChat(thread_ts, completedChatId);
        }

        logger.debug("✅ Setting completed reaction");
        await MessageState.setCompleted({
          channel,
          timestamp: ts,
        });
      },
    });
    logger.debug("✅ handleV0StreamToSlack finished");
  } catch (error) {
    logger.error("❌ app_mention handler failed:", error);

    MessageState.setError({
      channel,
      timestamp: ts,
    }).catch((error) => logger.warn("Failed to set error reaction:", error));
  } finally {
    if (thread_ts) {
      await updateAgentStatus({
        channel,
        thread_ts,
        status: "",
      }).catch((error) => logger.warn("Failed to clear agent status:", error));
    }
  }
};

const createPromptFromMessages = async (messages: SlackUIMessage[]) => {
  const { text: prompt } = await generateText({
    model: "openai/gpt-4o-mini",
    messages,
    system:
      "Summarize this thread of messages into a prompt. The prompt should be concise and to the point.",
  });
  return prompt;
};

const getChatIdFromMessages = (messages: SlackUIMessage[]) => {
  let chatId: string | undefined;
  for (const message of messages) {
    if (typeof message.content === "string") {
      const urlRegex = /https?:\/\/[^\s]+/g;
      const urls = message.content.match(urlRegex) || [];

      for (const url of urls) {
        if (isV0ChatUrl(url)) {
          const chatIdFromUrl = tryGetChatIdFromV0Url(url);
          if (chatIdFromUrl) {
            chatId = chatIdFromUrl;
            break;
          }
        }
      }
      if (chatId) break;
    }
  }
  return chatId;
};

const resolveChatId = async (
  messages: SlackUIMessage[],
  thread_ts?: string,
): Promise<string | undefined> => {
  // First priority: chat ID from v0 URLs in messages
  const chatIdFromMessages = getChatIdFromMessages(messages);
  if (chatIdFromMessages) {
    return chatIdFromMessages;
  }

  // Second priority: existing chat ID from thread
  return await getChatIDFromThread(thread_ts);
};

const createAttachmentsArray = (
  messages: SlackUIMessage[],
): { url: string }[] => {
  const files = messages.flatMap((message) => message.metadata?.files);

  const attachments = [];
  for (const file of files) {
    if (file?.url_private) {
      const signedUrl = generateSignedAssetUrl(file.url_private, {
        expiryHours: 24,
        chatId: file.id,
      });
      attachments.push({
        url: signedUrl,
      });
    }
  }
  return attachments;
};

const updateAppMentionStatus = (event: AppMentionEvent) => {
  const { channel, thread_ts, ts } = event;
  try {
    if (thread_ts) {
      updateAgentStatus({
        channel,
        thread_ts,
        status: "is thinking...",
      });
    }
    MessageState.setProcessing({
      channel,
      timestamp: ts,
    });
  } catch (error) {
    app.logger.error("Failed to update app mention status:", error);
  }
};
