import type {
  AllMiddlewareArgs,
  SayFn,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import type { ActionsBlockElement, GenericMessageEvent } from "@slack/web-api";
import { generateText } from "ai";
import { app } from "~/app";
import { getSession } from "~/lib/auth/session";
import { getChatIDFromThread } from "~/lib/redis";
import { updateAgentStatus } from "~/lib/slack/utils";
import { type ChatDetail, chatsCreate, chatsSendMessage } from "~/lib/v0";

const TITLE_MAX_LENGTH = 29;
const TITLE_PREFIX = "🤖";
const DEFAULT_MODEL = "openai/gpt-4o-mini";
const DEFAULT_ERROR_MESSAGE =
  "Sorry, something went wrong processing your message. Please try again.";
const PROJECT_INSTRUCTIONS =
  "Do not use integrations in this project. Always skip the integrations step.";

export const directMessageCallback = async ({
  say,
  logger,
  event,
  context,
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & { event: GenericMessageEvent }) => {
  const { channel, thread_ts } = event;
  const { teamId, userId } = context;
  const session = await getSession(teamId, userId);

  try {
    const text = validateDirectMessageEvent(event);
    if (!text) {
      return;
    }

    // Fire-and-forget status update to avoid blocking
    updateAgentStatus({
      channel,
      thread_ts,
      status: "is thinking...",
    }).catch((error) => logger.warn("Failed to update agent status:", error));

    let chat: ChatDetail;

    const chatId = await getChatIDFromThread(thread_ts);

    if (chatId) {
      const { data: existingChat } = await chatsSendMessage({
        headers: {
          Authorization: `Bearer ${session.token}`,
          "X-Scope": session.selectedTeamId,
        },
        body: {
          message: text,
          responseMode: "sync",
        },
        path: { chatId },

        throwOnError: true,
      });
      chat = existingChat;
    } else {
      const { data: newChat } = await chatsCreate({
        headers: {
          Authorization: `Bearer ${session.token}`,
          "X-Scope": session.selectedTeamId,
        },
        body: {
          message: text,
          responseMode: "sync",
        },
        throwOnError: true,
      });
      chat = newChat;
    }

    const webUrl = chat.webUrl || `https://v0.dev/chat/${chat.id}`;
    const demoUrl = chat.latestVersion?.demoUrl;

    await sendChatResponseToSlack(say, chat.text, thread_ts, webUrl, demoUrl);
  } catch (error) {
    logger.error("Direct message handler failed:", error);

    await say({
      text: DEFAULT_ERROR_MESSAGE,
      thread_ts,
    });
  } finally {
    // this will clear the status
    updateAgentStatus({
      channel,
      thread_ts,
      status: "",
    });
  }
};

const validateDirectMessageEvent = (
  event: GenericMessageEvent,
): string | null => {
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

const generateDirectMessageTitle = async (
  messageText: string,
): Promise<string> => {
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

const sendChatResponseToSlack = async (
  say: SayFn,
  cleanedChat: string,
  thread_ts: string,
  webUrl?: string,
  demoUrl?: string,
): Promise<void> => {
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
        type: "section",
        text: {
          type: "mrkdwn",
          text: cleanedChat,
        },
      },
      {
        type: "actions",
        elements: actions,
      },
    ],
    text: cleanedChat,
    thread_ts,
  });
};
