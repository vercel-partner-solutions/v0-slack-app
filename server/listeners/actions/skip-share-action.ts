import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";

export const skipShareActionCallback = async ({
  ack,
  logger,
  respond,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  logger.info("Skip share action clicked");

  try {
    await ack();
    await respond({
      text: "",
      delete_original: true,
    });
  } catch (error) {
    logger.error("Failed to handle skip action:", error);
  }
};
