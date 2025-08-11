import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ModelMessage } from "ai";
import { respondToMessage } from "~/lib/ai/respond-to-message";
import {
  getChannelContextAsModelMessage,
  getThreadContextAsModelMessage,
  updateAgentStatus,
} from "~/lib/slack/utils";

const appMentionCallback = async ({
  event,
  say,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  let messages: ModelMessage[] = [];

  try {
    const { channel, thread_ts } = event;

    if (thread_ts) {
      await updateAgentStatus({
        channelId: channel,
        threadTs: thread_ts,
        status: "is typing...",
      });
      messages = await getThreadContextAsModelMessage(
        thread_ts,
        channel,
        context.botId,
      );
    } else {
      messages = await getChannelContextAsModelMessage(channel, context.botId);
    }

    const response = await respondToMessage({ messages });
    await say({
      text: response,
      thread_ts: event.thread_ts || event.ts,
    });
  } catch (error) {
    logger.error("app_mention handler failed:", error);
    await say({
      text: "Sorry, something went wrong processing your message. Please try again.",
      thread_ts: event.thread_ts || event.ts,
    });
  }
};

export default appMentionCallback;
