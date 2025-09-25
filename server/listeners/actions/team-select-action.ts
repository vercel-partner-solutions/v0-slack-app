import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { Vercel } from "@vercel/sdk";
import { getSession } from "~/lib/auth/session";
import { redis } from "~/lib/redis";

export const teamSelectActionCallback = async ({
  ack,
  logger,
  body,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();

    const slackUserId = body.user.id;
    const session = await getSession(slackUserId);

    if (!session) {
      logger.error("Team select action failed: no session found for user", {
        slackUserId,
      });
      return;
    }

    const action = body.actions[0];
    if (action.type !== "static_select" || !action.selected_option) {
      logger.error(
        "Team select action failed: invalid action type or no selection",
      );
      return;
    }

    const selectedTeamId = action.selected_option.value;

    const vercel = new Vercel({
      bearerToken: session.token,
    });

    const { teams } = await vercel.teams.getTeams({});
    const selectedTeam = teams?.find((team) => team.id === selectedTeamId);

    if (!selectedTeam) {
      logger.error("Team select action failed: selected team not found", {
        selectedTeamId,
        availableTeams: teams?.map((t) => t.id),
      });
      return;
    }
    const updatedSession = {
      ...session,
      selectedTeamId: selectedTeam.id,
      selectedTeamName: selectedTeam.name,
    };

    await redis.set(`session:${slackUserId}`, updatedSession);
  } catch (error) {
    logger.error("Team select action callback failed:", error);
  }
};
