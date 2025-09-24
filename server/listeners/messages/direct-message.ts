import type {
  AllMiddlewareArgs,
  SayFn,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import type { GenericMessageEvent, WebClient } from "@slack/web-api";
import { generateText } from "ai";
import { type ChatDetail, v0 } from "v0-sdk";
import { app } from "~/app";
import { cleanV0Stream } from "~/lib/ai/utils";
import { updateAgentStatus } from "~/lib/slack/utils";

const CHAT_KEY_PREFIX = "chat:";
const TITLE_MAX_LENGTH = 29;
const TITLE_PREFIX = "🤖";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_ERROR_MESSAGE =
  "Sorry, something went wrong processing your message. Please try again.";
const PROJECT_INSTRUCTIONS =
  "Do not use integrations in this project. Always skip the integrations step.";
const redis = useStorage("redis");

const validateMessageEvent = (event: GenericMessageEvent): string | null => {
  const { text, subtype } = event;

  if (subtype === "message_changed") {
    app.logger.warn(
      "Direct message event received with message_changed subtype. Skipping...",
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

const generateChatTitle = async (messageText: string): Promise<string> => {
  const { text: title } = await generateText({
    model: DEFAULT_MODEL,
    system: `
    Take these messages and generate a title that will be given to v0, a generative UI tool. The title should be concise and relevant to the conversation.
    The title should be no more than ${TITLE_MAX_LENGTH} characters.
    `,
    messages: [{ role: "user", content: messageText }],
  });

  return `${TITLE_PREFIX} ${title}`;
};

const createNewChat = async (
  text: string,
  client: WebClient,
  channel: string,
  thread_ts: string,
): Promise<ChatDetail> => {
  const titleWithPrefix = await generateChatTitle(text);

  const projectId = await v0.projects.create({
    name: titleWithPrefix,
    instructions: PROJECT_INSTRUCTIONS,
  });

  await client.assistant.threads.setTitle({
    channel_id: channel,
    thread_ts,
    title: titleWithPrefix,
  });

  const v0Chat = (await v0.chats.create({
    message: text,
    projectId: projectId.id,
    responseMode: "sync",
  })) as ChatDetail;

  await redis.set(`${CHAT_KEY_PREFIX}${thread_ts}`, v0Chat.id);

  return v0Chat;
};

const sendToExistingChat = async (
  chatId: string,
  text: string,
): Promise<ChatDetail> => {
  return (await v0.chats.sendMessage({
    chatId,
    message: text,
    responseMode: "sync",
  })) as ChatDetail;
};

const formatResponse = (v0Chat: ChatDetail): string => {
  return cleanV0Stream(v0Chat.text);
};

const sendSlackResponse = async (
  say: SayFn,
  summary: string,
  thread_ts: string,
  webUrl?: string,
  demoUrl?: string,
): Promise<void> => {
  const actions = [];

  if (webUrl) {
    actions.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Open in v0",
      },
      url: webUrl,
      action_id: "open_in_v0",
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
      action_id: "view_demo",
    });
  }

  await say({
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: summary,
        },
      },
      {
        type: "actions",
        elements: actions,
      },
    ],
    text: summary,
    thread_ts,
  });
};

export const directMessageCallback = async ({
  say,
  logger,
  event,
  client,
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & { event: GenericMessageEvent }) => {
  const { channel, thread_ts } = event;

  try {
    const text = validateMessageEvent(event);
    if (!text) {
      return;
    }

    // immediately update the thread status, don't await and block the thread
    updateAgentStatus({
      channel,
      thread_ts,
      status: "is thinking...",
    });

    let v0Chat: ChatDetail;

    const { exists, chatId } = await doesChatExist(thread_ts);

    if (exists && chatId) {
      v0Chat = await sendToExistingChat(chatId, text);
    } else {
      v0Chat = await createNewChat(text, client, channel, thread_ts);
    }

    const summary = formatResponse(v0Chat);
    const webUrl = v0Chat.webUrl || `https://v0.dev/chat/${v0Chat.id}`;
    const demoUrl = v0Chat.latestVersion?.demoUrl || "";

    await sendSlackResponse(say, summary, thread_ts, webUrl, demoUrl);
  } catch (error) {
    logger.error("Direct message handler failed:", error);

    await say({
      text: DEFAULT_ERROR_MESSAGE,
      thread_ts,
    });
  }
};

const doesChatExist = async (
  thread_ts: string,
): Promise<{ exists: boolean; chatId: string | null }> => {
  const chatKey = `${CHAT_KEY_PREFIX}${thread_ts}`;
  try {
    const existingChatId = await redis.get(chatKey);
    if (!existingChatId) return { exists: false, chatId: null };
    const v0Chat = await v0.chats.getById({ chatId: existingChatId as string });
    return {
      exists: v0Chat?.id === existingChatId,
      chatId: existingChatId as string,
    };
  } catch (error) {
    app.logger.error("Failed to check if chat exists:", error);
    return { exists: false, chatId: null };
  }
};
