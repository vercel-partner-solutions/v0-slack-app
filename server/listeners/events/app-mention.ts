import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { AppMentionEvent } from "@slack/web-api";
import { generateText } from "ai";
import { type ChatDetail, v0 } from "v0-sdk";
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
import { cleanV0Stream } from "~/lib/v0/utils";

export const appMentionCallback = async ({
  event,
  say,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  const { channel, thread_ts, ts } = event;

  updateAppMentionStatus(event);

  try {
    const messages = await getMessagesFromEvent(event);

    const [prompt, attachments, chatId] = await Promise.all([
      createPromptFromMessages(messages),
      createAttachmentsArray(messages),
      resolveChatId(messages, thread_ts),
    ]);

    let chat: ChatDetail;
    if (chatId) {
      const [updatedChat] = (await Promise.all([
        v0.chats.sendMessage({
          chatId,
          message: prompt,
          responseMode: "sync",
          attachments: attachments,
        }),
        setExistingChat(thread_ts, chatId),
      ])) as [ChatDetail, undefined];
      chat = updatedChat;
    } else {
      chat = (await v0.chats.create({
        message: prompt,
        responseMode: "sync",
        attachments: attachments,
      })) as ChatDetail;
      await setExistingChat(thread_ts, chat.id);
    }

    const summary = formatChatResponse(chat);

    await say({
      blocks: [
        {
          type: "markdown",
          text: summary,
        },
      ],
      text: summary,
      thread_ts: thread_ts || ts,
    });

    await MessageState.setCompleted({
      channel,
      timestamp: ts,
    });
  } catch (error) {
    logger.error("app_mention handler failed:", error);

    MessageState.setError({
      channel,
      timestamp: ts,
    }).catch((error) => logger.warn("Failed to set error reaction:", error));
  } finally {
    // clear agent status
    if (thread_ts) {
      await updateAgentStatus({
        channel,
        thread_ts,
        status: "",
      });
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

const formatChatResponse = (v0Chat: ChatDetail): string => {
  let summary = cleanV0Stream(v0Chat.text);
  const demoUrl = v0Chat.latestVersion?.demoUrl;

  if (demoUrl) {
    summary += `\n\n<${demoUrl}|View demo>`;
  }

  return summary;
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
