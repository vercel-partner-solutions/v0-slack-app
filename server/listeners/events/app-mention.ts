import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { ModelMessage } from "ai";
import { respondToMessage } from "~/lib/ai/respond-to-message";
import { getChannelContextAsModelMessage } from "~/lib/slack/get-channel-context";
import { getThreadContextAsModelMessage } from "~/lib/slack/get-thread-context";
import { updateAgentStatus } from "~/lib/slack/update-agent-status";

const appMentionCallback = async ({
  event,
  say,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  let threadContext: ModelMessage[] = [];

  try {
    const { channel, thread_ts } = event;

    if (thread_ts) {
      await updateAgentStatus({
        channelId: channel,
        threadTs: thread_ts,
        status: "is typing...",
      });
      threadContext = await getThreadContextAsModelMessage(
        thread_ts,
        channel,
        context.botId,
      );
    } else {
      threadContext = await getChannelContextAsModelMessage(
        channel,
        context.botId,
      );
    }
  } catch (error) {
    logger.error("Failed to get context, using message as fallback:", error);
    threadContext = [{ role: "user", content: event.text }];
  }

  const response = await respondToMessage(threadContext);
  await say({
    text: response,
    thread_ts: event.thread_ts || event.ts,
  });
};

export default appMentionCallback;
