import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ModelMessage } from "ai";
import { respondToMessage } from "~/lib/ai/respond-to-message";
import {
  getChannelContextAsModelMessage,
  getThreadContextAsModelMessage,
  updateAgentStatus,
} from "~/lib/slack/utils";

export const directMessageCallback = async ({
  message,
  say,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
  if ("text" in message && typeof message.text === "string") {
    let messages: ModelMessage[] = [];

    // @ts-expect-error
    const { channel, thread_ts } = message;
    const { botId } = context;

    try {
      if (thread_ts) {
        updateAgentStatus({
          channelId: channel,
          threadTs: thread_ts,
          status: "is typing...",
        });

        messages = await getThreadContextAsModelMessage(
          thread_ts,
          channel,
          botId,
        );
      } else {
        messages = await getChannelContextAsModelMessage(channel, botId);
      }
    } catch (error) {
      logger.error("Failed to get context, using message as fallback:", error);
      messages = [{ role: "user", content: message.text }];
    }

    const response = await respondToMessage({
      messages,
      channel,
      thread_ts,
    });

    await say({
      text: response,
      thread_ts: message.ts,
    });
  } else {
    logger.debug("Direct message received with no text");
  }
};
