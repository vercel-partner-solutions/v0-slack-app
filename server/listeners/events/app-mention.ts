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
  } catch (error) {
    logger.error("Failed to get context, using message as fallback:", error);
    messages = [{ role: "user", content: event.text }];
  }

  const response = await respondToMessage({ messages });
  await say({
    text: response,
    thread_ts: event.thread_ts || event.ts,
  });
};

export default appMentionCallback;
