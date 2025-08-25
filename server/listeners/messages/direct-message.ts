import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ModelMessage } from "ai";
import { respondToMessage } from "~/lib/ai/respond-to-message";
import {
  getThreadContextAsModelMessage,
  updateAgentStatus,
  MessageState,
} from "~/lib/slack/utils";

export const directMessageCallback = async ({
  message,
  say,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
  // @ts-expect-error
  const { channel, thread_ts, text, ts } = message;
  const { botId } = context;

  if (!text) return;

  await MessageState.setProcessing({
    channel,
    timestamp: ts,
  });

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
      isDirectMessage: true,
    });

    await say({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: response,
          },
        },
      ],
      // It's important to keep the text property as a fallback for improper markdown
      text: response,
      thread_ts: thread_ts || message.ts,
    });

    await MessageState.setCompleted({
      channel,
      timestamp: ts,
    });
  } catch (error) {
    logger.error("DM handler failed:", error);
    
    // Try to mark message as failed, but don't let this prevent user notification
    try {
      await MessageState.setError({
        channel,
        timestamp: ts,
      });
    } catch (reactionError) {
      logger.warn("Failed to set error reaction:", reactionError);
    }
    
    await say({
      text: "Sorry, something went wrong processing your message. Please try again.",
      thread_ts: thread_ts || message.ts,
    });
  }
};
