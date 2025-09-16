import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";

export const signOutActionCallback = async ({
  ack,
  logger,
  body,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();
    const { user, api_app_id } = body;
    const { id, team_id } = user;

    await $fetch(
      `/sign-out?slack_user_id=${id}&team_id=${team_id}&app_id=${api_app_id}`,
    );
  } catch (error) {
    logger.error("Sign out action callback failed:", error);
  }
};
