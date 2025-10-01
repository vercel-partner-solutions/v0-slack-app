import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { renderAppHomeView } from "~/lib/slack/ui/home";

export const signOutActionCallback = async ({
  ack,
  logger,
  context,
  body,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  const { userId, teamId, session } = context;
  const appId = body.api_app_id;
  try {
    await ack();
    await $fetch(
      `/sign-out?slack_user_id=${userId}&team_id=${teamId}&app_id=${appId}`,
    );

    logger.info("User signed out successfully", { userId, teamId });
  } catch (error) {
    logger.error("Sign out action callback failed:", error);

    try {
      await renderAppHomeView({
        userId,
        teamId,
        session,
        appId,
      });
    } catch (viewError) {
      logger.error("Fallback view update also failed:", viewError);
    }
  }
};
