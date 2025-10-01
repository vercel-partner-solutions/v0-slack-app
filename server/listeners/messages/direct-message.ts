import type {
  AllMiddlewareArgs,
  SayFn,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import type { ActionsBlockElement, GenericMessageEvent } from "@slack/web-api";

import { generateSignedAssetUrl } from "~/lib/assets/utils";
import { getChatIDFromThread, setExistingChat } from "~/lib/redis";
import { SignInBlock } from "~/lib/slack/ui/blocks";
import { updateAgentStatus } from "~/lib/slack/utils";
import {
  type ChatDetail,
  chatsCreate,
  chatsSendMessage,
} from "~/lib/v0/client";
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
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & { event: GenericMessageEvent }) => {
  const { channel, thread_ts, files } = event;
  const { session } = context;

  // we only support message events from users. Subtypes can be seen here: https://docs.slack.dev/reference/events/message/
  if (message.subtype) {
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

  try {
    // Fire-and-forget status update to avoid blocking
    updateAgentStatus({
      channel,
      thread_ts,
      status: "is thinking...",
    }).catch((error) => logger.warn("Failed to update agent status:", error));

    if (!session) {
      await client.chat.postEphemeral({
        channel,
        user: context.userId,
        blocks: [SignInBlock({ user: context.userId, teamId: context.teamId })],
        text: "Please sign in to continue.",
        thread_ts,
      });
      return;
    }

    let chat: ChatDetail;

    const chatId = await getChatIDFromThread(thread_ts);
    const attachments = createAttachmentsArray(files || []);

    if (chatId) {
      const { data: chatData, error } = await chatsSendMessage({
        path: {
          chatId,
        },
        body: {
          message: event.text,
          responseMode: "sync",
          attachments,
        },
        headers: {
          Authorization: `Bearer ${session.token}`,
          "X-Scope": session.selectedTeamId,
          "x-v0-client": "slack",
        },
      });

      if (error) {
        throw new Error(error.error.message, { cause: error.error.type });
      }

      chat = chatData;
    } else {
      const { data: chatData, error } = await chatsCreate({
        body: {
          message: event.text,
          responseMode: "sync",
          attachments,
          system: SYSTEM_PROMPT,
        },
        headers: {
          Authorization: `Bearer ${session.token}`,
          "x-scope": session.selectedTeamId,
          "x-v0-client": "slack",
        },
      });

      if (error) {
        throw new Error(error.error.message, { cause: error.error.type });
      }

      chat = chatData;
    }
    await setExistingChat(thread_ts, chat.id);

    const cleanedChat = cleanV0Stream(chat.text);
    const webUrl = chat.webUrl || `https://v0.dev/chat/${chat.id}`;
    const demoUrl = chat.latestVersion?.demoUrl;

    await sendChatResponseToSlack(say, cleanedChat, thread_ts, webUrl, demoUrl);
  } catch (error: unknown) {
    logger.error("Direct message handler failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;

    await say({
      text: errorMessage,
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
