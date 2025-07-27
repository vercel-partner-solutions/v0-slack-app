import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { respondToMessage } from "~/lib/ai/respond-to-message";

const appMentionCallback = async ({
  event,
  say,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  logger.debug("App mentioned:", JSON.stringify(event, null, 2));
  const response = await respondToMessage(event.text, event.user);
  await say({
    text: response,
    thread_ts: event.thread_ts || event.ts,
  });
};

export default appMentionCallback;
