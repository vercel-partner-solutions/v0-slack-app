import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";

export const viewDemoActionCallback = async ({
  ack,
  logger,
  action,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  const { action_id } = action;
  try {
    await ack();
    logger.info(`View demo clicked: ${action_id}`);
  } catch (error) {
    logger.error("Failed to ack view demo action:", error);
  }
};
