import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { renderAppHomeView } from "~/lib/slack/ui/home";

export const appHomeOpenedCallback = async ({
  event,
  context,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_home_opened">) => {
  // Ignore the `app_home_opened` event for anything but the Home tab
  if (event.tab !== "home") return;

  const { userId, teamId, session } = context;

  if (!userId || !teamId) {
    logger.error(
      "App home opened callback failed: no user ID or team ID found",
      {
        userId,
        teamId,
      },
    );
    return;
  }

  await renderAppHomeView({
    userId,
    teamId,
    session,
  });
};
