import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { AppMentionEvent } from "@slack/web-api";
import { generateText, type ModelMessage } from "ai";
import { getSession } from "~/lib/auth/session";
import { getChatIDFromThread } from "~/lib/redis";
import {
  getThreadMessagesAsModelMessages,
  isV0ChatUrl,
  MessageState,
  tryGetChatIdFromV0Url,
  updateAgentStatus,
} from "~/lib/slack/utils";
import { chatsCreate, chatsSendMessage } from "~/lib/v0";

const createSessionHeaders = async (teamId: string, userId: string) => {
  const session = await getSession(teamId, userId);
  return {
    Authorization: `Bearer ${session.token}`,
    // "X-Scope": session.selectedTeamId,
  };
};

export const appMentionCallback = async ({
  event,
  say,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  const { channel, thread_ts, ts } = event;
  const { teamId, userId } = context;

  if (!event.text) {
    return;
  }

  if (thread_ts) {
    await updateAgentStatus({
      channel,
      thread_ts,
      status: "is thinking...",
    });
  }

  // fire and forget emoji update
  MessageState.setProcessing({
    channel,
    timestamp: ts,
  }).catch((error) =>
    logger.warn("Failed to set processing reaction:", error.message),
  );

  try {
    const { messages } = await getAppMentionContext(event);
    const [prompt, chatId] = await Promise.all([
      getPromptFromMessages(messages),
      resolveChatId(messages, thread_ts),
    ]);

    const sessionHeaders = await createSessionHeaders(teamId, userId);

    const { data } = chatId
      ? await chatsSendMessage({
          ...sessionHeaders,
          body: {
            message: prompt,
            responseMode: "sync",
          },
          path: { chatId },
          throwOnError: true,
        })
      : await chatsCreate({
          ...sessionHeaders,
          body: {
            message: prompt,
            responseMode: "sync",
          },
          throwOnError: true,
        });

    await say({
      blocks: [
        {
          type: "markdown",
          text: data.text,
        },
      ],
      text: data.text,
      channel,
      thread_ts: thread_ts || ts,
    });

    await MessageState.setCompleted({
      channel,
      timestamp: ts,
    });
  } catch (error) {
    if (error instanceof Error) {
      logger.error("app_mention handler failed:", error.message);
    } else {
      logger.error("app_mention handler failed:", error);
    }

    MessageState.setError({
      channel,
      timestamp: ts,
    }).catch((error) =>
      logger.warn("Failed to set error reaction:", error.message),
    );
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

const getPromptFromMessages = async (messages: ModelMessage[]) => {
  if (messages.length === 1 && typeof messages[0].content === "string") {
    // Single message - use it directly as the prompt
    return messages[0].content;
  } else {
    // Multiple messages - generate a summarized prompt
    return await generatePromptFromMessages(messages);
  }
};

const generatePromptFromMessages = async (messages: ModelMessage[]) => {
  const { text: prompt } = await generateText({
    model: "openai/gpt-4o-mini",
    messages,
    system:
      "Summarize the thread messages into a prompt for a software engineer.",
  });
  return prompt;
};

type AppMentionContext = {
  messages: ModelMessage[];
};

const getAppMentionContext = async (
  event: AppMentionEvent,
): Promise<AppMentionContext> => {
  const { channel, thread_ts, bot_id, text } = event;
  let messages: ModelMessage[] = [];
  if (thread_ts) {
    messages = await getThreadMessagesAsModelMessages({
      channel,
      ts: thread_ts,
      botId: bot_id,
    });
  } else {
    messages = [
      {
        role: "user",
        content: text,
      },
    ];
  }
  return { messages };
};

const getChatIdFromMessages = (messages: ModelMessage[]) => {
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
  messages: ModelMessage[],
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
