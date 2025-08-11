import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";

export const onlyChannelType =
  (type: "im" | "group" | "mpim") =>
  async ({
    event,
    next,
  }: SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs) => {
    if (event.channel_type === type) {
      await next();
    }
  };
