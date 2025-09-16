import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";

export const signInActionCallback = async ({
  ack,
  logger,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();
  } catch (error) {
    logger.error("Login action callback failed:", error);
  }
};
