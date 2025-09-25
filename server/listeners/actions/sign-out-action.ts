import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";

export const signOutActionCallback = async ({
  ack,
  logger,
  context,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  const { userId, teamId } = context;

  try {
    await ack();
    await $fetch(`/sign-out?slack_user_id=${userId}&team_id=${teamId}`);

    logger.info("User signed out successfully", { userId, teamId });
  } catch (error) {
    logger.error("Sign out action callback failed:", error);

    try {
      const { updateAppHomeView } = await import("~/lib/slack/utils");
      await updateAppHomeView({
        userId,
        teamId,
      });
    } catch (viewError) {
      logger.error("Fallback view update also failed:", viewError);
    }
  }
};
