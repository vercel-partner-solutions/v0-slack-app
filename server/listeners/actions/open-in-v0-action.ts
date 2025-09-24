import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";

export const openInV0ActionCallback = async ({
  ack,
  logger,
  action,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  const { action_id } = action;
  try {
    await ack();
    logger.info(`Open in V0 clicked: ${action_id}`);
  } catch (error) {
    logger.error("Failed to ack open in v0 action:", error);
  }
};
