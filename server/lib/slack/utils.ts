import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";

/**
 * Helper function to create a middleware that only runs a callback if the message
 * is in a specific Slack channel type.
 *
 * @example
 * app.message(onlyChannelType("im"), directMessageCallback);
 *
 * @param {SlackEventMiddlewareArgs<"message">["event"]["channel_type"]} type - The Slack channel type to filter for ("im", "group", "mpim", "channel").
 * @returns {Function} Middleware function that only calls next() if the event's channel_type matches the specified type.
 */
export const onlyChannelType =
  (type: SlackEventMiddlewareArgs<"message">["event"]["channel_type"]) =>
  async ({
    event,
    next,
  }: SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs) => {
    if (event.channel_type === type) {
      await next();
    }
  };

export type TextMessageArgs = SlackEventMiddlewareArgs<"message"> &
  AllMiddlewareArgs & {
    message: {
      text: string;
      ts: string;
      channel: string;
      thread_ts?: string;
    };
  };
