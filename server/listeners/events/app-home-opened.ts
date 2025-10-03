import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { renderAppHomeView } from "~/lib/slack/ui/home";

export const appHomeOpenedCallback = async ({
  event,
  context,
  logger,
  body,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_home_opened">) => {
  // Ignore the `app_home_opened` event for anything but the Home tab
  if (event.tab !== "home") return;

  const { userId, teamId, session } = context;
  const appId = body.api_app_id;

  if (!userId || !teamId || !appId) {
    logger.error(
      "App home opened callback failed: no user ID, team ID, or app ID found",
      {
        userId,
        teamId,
        appId,
      },
    );
    return;
  }

  await renderAppHomeView({
    userId,
    teamId,
    session,
    appId,
  });
};
