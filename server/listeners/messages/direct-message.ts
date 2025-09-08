import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { type ChatDetail, v0 } from "v0-sdk";
import { extractV0Summary } from "~/lib/ai/utils";
import {
  getLastAssistantMessage,
  getThreadContextAsModelMessage,
  type SlackUIMessage,
  updateAgentStatus,
} from "~/lib/slack/utils";

export const directMessageCallback = async ({
  message,
  say,
  logger,
  context,
  client,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
  // @ts-expect-error
  const { channel, thread_ts, text } = message;
  const { botId } = context;
  let isNewChat = false;
  let v0ChatId = null;
  let demoUrl = null;
  let summary = null;

  if (!text) return;

  updateAgentStatus({
    channel,
    thread_ts,
    status: "is typing...",
  });

  let messages: SlackUIMessage[] = [];
  try {
    if (thread_ts) {
      messages = await getThreadContextAsModelMessage({
        channel,
        ts: thread_ts,
        botId,
        include_all_metadata: true,
      });
    } else {
      messages = [
        {
          role: "user",
          content: text,
        },
      ];
    }

    if (
      messages[0].content === "New Assistant Thread" &&
      messages.length === 2
    ) {
      isNewChat = true;
    } else {
      isNewChat = false;
    }

    if (isNewChat) {
      await v0.chats
        .create({
          message: text,
          projectId: "PHodj8mYCm1",
          responseMode: "sync",
        })
        .then((chat: ChatDetail) => {
          v0ChatId = chat.id;
          demoUrl = chat.latestVersion.demoUrl;
          summary = extractV0Summary(
            chat.messages[chat.messages.length - 1].content,
          );

          client.assistant.threads.setTitle({
            channel_id: channel,
            thread_ts: thread_ts || message.ts,
            title: chat.name,
          });
        });
    } else {
      const lastAssistantMessage = getLastAssistantMessage(messages);
      if (lastAssistantMessage?.metadata?.event_payload?.chat_id) {
        v0ChatId = lastAssistantMessage.metadata.event_payload.chat_id;
      }
      await v0.chats
        .sendMessage({
          chatId: v0ChatId,
          message: text,
        })
        .then((message: ChatDetail) => {
          summary = extractV0Summary(
            message.messages[message.messages.length - 1].content,
          );
          demoUrl = message.latestVersion.demoUrl;
        });
    }

    await say({
      blocks: [
        {
          type: "markdown",
          text: summary,
        },
        {
          type: "divider",
        },
        {
          type: "markdown",
          text: `<${demoUrl}|View demo>`,
        },
      ],
      text: summary,
      metadata: {
        event_payload: {
          chat_id: v0ChatId,
        },
        event_type: "v0_chat_created",
      },
      thread_ts: thread_ts || message.ts,
    });
  } catch (error) {
    logger.error("DM handler failed:", error);
    await say({
      text: "Sorry, something went wrong processing your message. Please try again.",
      thread_ts: thread_ts || message.ts,
    });
  }
};
