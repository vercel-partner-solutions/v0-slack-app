import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { AppMentionEvent } from "@slack/web-api";
import { generateText, type ModelMessage } from "ai";
import { type ChatDetail, v0 } from "v0-sdk";
import { getChatIDFromThread, setExistingChat } from "~/lib/redis";
import {
  getThreadMessagesAsModelMessages,
  isV0ChatUrl,
  MessageState,
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
  }).catch((error) => logger.warn("Failed to set processing reaction:", error));

  try {
    const { messages } = await getAppMentionContext(event);
    const [prompt, chatId] = await Promise.all([
      getPromptFromMessages(messages),
      resolveChatId(messages, thread_ts),
    ]);
    const v0Chat = await processV0Message(chatId, prompt, messages, thread_ts);
    const summary = formatV0Response(v0Chat);

    await say({
      blocks: [
        {
          type: "markdown",
          text: summary,
        },
      ],
      text: summary,
      thread_ts,
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

const generateTitleFromMessages = async (messages: ModelMessage[]) => {
  const { text: title } = await generateText({
    model: "openai/gpt-4o-mini",
    messages,
    system:
      "Generate a short, concise title for the v0 project in 30 characters or less.",
  });
  return title;
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
      "Summarize this thread of messages into a prompt. The prompt should be concise and to the point.",
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

const sendMessageToExistingChat = async (chatId: string, prompt: string) => {
  const v0Chat = await v0.chats.sendMessage({
    chatId,
    message: prompt,
    responseMode: "sync",
  });
  return v0Chat as ChatDetail;
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

const processV0Message = async (
  chatId: string | undefined,
  prompt: string,
  messages: ModelMessage[],
  thread_ts: string,
): Promise<ChatDetail> => {
  if (chatId) {
    const v0Chat = await sendMessageToExistingChat(chatId, prompt);

    // If we found a chat ID from messages, link the thread
    const chatIdFromMessages = getChatIdFromMessages(messages);
    if (chatIdFromMessages && chatIdFromMessages !== chatId) {
      await setExistingChat(thread_ts, chatIdFromMessages);
    }

    return v0Chat;
  } else {
    const v0Chat = await sendMessageToNewChat(prompt, messages);
    await setExistingChat(thread_ts, v0Chat.id);
    return v0Chat;
  }
};

const formatV0Response = (v0Chat: ChatDetail): string => {
  let summary = cleanV0Stream(v0Chat.text);
  const demoUrl = v0Chat.latestVersion?.demoUrl;

  if (demoUrl) {
    summary += `\n\n<${demoUrl}|View demo>`;
  }

  return summary;
};

const sendMessageToNewChat = async (
  prompt: string,
  messages: ModelMessage[],
) => {
  const title = await generateTitleFromMessages(messages);
  const projectId = await v0.projects.create({
    name: `🤖 ${title}`,
    instructions:
      "Do not use integrations in this project. Always skip the integrations step.",
  });
  const v0Chat = await v0.chats.create({
    message: prompt,
    projectId: projectId.id,
    responseMode: "sync",
  });
  return v0Chat as ChatDetail;
};
