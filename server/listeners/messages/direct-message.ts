import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ModelMessage } from "ai";
import { respondToMessage } from "~/lib/ai/respond-to-message";
import {
  getThreadContextAsModelMessage,
  updateAgentStatus,
} from "~/lib/slack/utils";

export const directMessageCallback = async ({
  message,
  event,
  say,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
  // @ts-expect-error
  const { channel, thread_ts, text } = message;
  const { botId } = context;

  if (!text) return;

  let messages: ModelMessage[] = [];
  try {
    if (thread_ts) {
      updateAgentStatus({
        channel,
        thread_ts,
        status: "is typing...",
      });
      messages = await getThreadContextAsModelMessage({
        channel,
        ts: thread_ts,
        botId,
      });
    } else {
      messages = [
        {
          role: "user",
          content: text,
        },
      ];
    }

    const response = await respondToMessage({
      messages,
      channel,
      thread_ts,
      botId,
      event,
    });

    await say({
      blocks: [
        {
          type: "markdown",
          text: response,
        },
      ],
      text: response,
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
