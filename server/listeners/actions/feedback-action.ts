import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";

export const feedbackActionCallback = async ({
  ack,
  logger,
  action,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  const { action_id } = action;
  logger.info(JSON.stringify(action, null, 2));
  try {
    await ack();
    logger.info(`Feedback clicked: ${action_id}`);
  } catch (error) {
    logger.error("Failed to ack feedback action:", error);
  }
};
