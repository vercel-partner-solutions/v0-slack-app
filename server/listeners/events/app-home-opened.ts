import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { HomeView } from "@slack/web-api";
import { Vercel } from "@vercel/sdk";
import { app } from "~/app";
import { deleteSession, type Session } from "~/lib/auth/session";
import { updateAppHomeView } from "~/lib/slack/utils";

const appHomeOpenedCallback = async ({
  client,
  event,
  logger,
  body,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_home_opened">) => {
  // Ignore the `app_home_opened` event for anything but the Home tab
  if (event.tab !== "home") return;

  try {
    await updateAppHomeView({
      userId: context.userId,
      teamId: context.teamId,
    });
  } catch (error) {
    logger.error("app_home_opened handler failed:", error);
  }
};

export default appHomeOpenedCallback;

export const SignedInView = async (
  session: Session,
  body: { event: { user: string }; team_id: string },
): Promise<HomeView> => {
  const vercel = new Vercel({
    bearerToken: session?.token,
  });
  try {
    const [{ user }, { teams }] = await Promise.all([
      vercel.user.getAuthUser(),
      vercel.teams.getTeams({}),
    ]);

    if (!user) {
      app.logger.error("SignedInView failed: user not found");
      return SignedOutView(body);
    }

    if (!teams) {
      app.logger.error("SignedInView failed: teams not found");
      return SignedOutView(body);
    }

    const selectedTeam = teams.find(
      (team) => team.id === session.selectedTeamId,
    );

    return {
      type: "home",
      blocks: [
        {
          type: "context",
          elements: [
            {
              type: "image",
              image_url: `https://vercel.com/api/www/avatar?&u=${user.username}`,
              alt_text: "profile picture",
            },
            {
              type: "mrkdwn",
              text: `${user.email ?? user.username}`,
            },
          ],
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Select a team:",
          },
          accessory: {
            type: "static_select",
            placeholder: {
              type: "plain_text",
              text: "Choose a team",
            },
            action_id: "team-select-action",
            ...(selectedTeam
              ? {
                  initial_option: {
                    text: {
                      type: "plain_text",
                      text: selectedTeam.name,
                    },
                    value: selectedTeam.id,
                  },
                }
              : {}),
            options: teams.map((team) => ({
              text: {
                type: "plain_text",
                text: team.name,
              },
              value: team.id,
            })),
          },
        },
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: " ",
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Sign Out",
            },
            action_id: "sign-out-action",
            value: "sign-out",
          },
        },
      ],
    };
  } catch (error) {
    await deleteSession(session.slackTeamId, session.slackUserId);
    app.logger.error("SignedInView failed:", error);
    return SignedOutView(body);
  }
};

export const SignedOutView = (body: {
  event: { user: string };
  team_id: string;
}): HomeView => {
  return {
    type: "home",
    blocks: [
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "Click here to sign in to v0",
        },
        accessory: {
          type: "button",
          text: {
            type: "plain_text",
            text: "Sign In",
          },
          action_id: "sign-in-action",
          value: "sign-in",
          url: `http://localhost:3000/sign-in?slack_user_id=${body.event.user}&team_id=${body.team_id}`,
        },
      },
    ],
  };
};
