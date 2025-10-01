import type { HomeView } from "@slack/web-api";
import { app } from "~/app";
import { getBaseUrl } from "~/lib/assets/utils";
import { deleteSession, type Session } from "~/lib/auth/session";
import { userGet, userGetScopes } from "~/lib/v0/client";

interface SignedInViewProps {
  user: { username: string; email: string; avatar: string };
  selectedTeam: { id: string; name: string } | null;
  teams: { id: string; name: string }[];
}

const SignedInView = (props: SignedInViewProps): HomeView => {
  const { user, selectedTeam, teams } = props;

  return {
    type: "home",
    blocks: [
      // Header
      {
        type: "header",
        text: {
          type: "plain_text",
          text: "Settings",
        },
      },
      {
        type: "divider",
      },

      // Team Selection Section
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Team*",
        },
      },
      {
        type: "actions",
        elements: [
          {
            type: "static_select",
            placeholder: {
              type: "plain_text",
              text: "Select your team",
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
        ],
      },

      {
        type: "divider",
      },
      {
        type: "section",
        text: {
          type: "mrkdwn",
          text: "*Account*",
        },
      },
      {
        type: "context",
        elements: [
          {
            type: "image",
            image_url: user.avatar,
            alt_text: "profile picture",
          },
          {
            type: "mrkdwn",
            text: `*${user.email ?? user.username}*`,
          },
        ],
      },
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Sign Out",
            },
            accessibility_label: "Sign Out",
            style: "danger",
            action_id: "sign-out-action",
            value: "sign-out",
          },
        ],
      },
    ],
  };
};

export const getSignInUrl = (user: string, teamId: string) => {
  let host = "http://localhost:3000";
  if (process.env.NODE_ENV === "production") {
    host = getBaseUrl();
  }
  return `${host}/sign-in?slack_user_id=${user}&team_id=${teamId}`;
};

interface SignedOutViewProps {
  user: string;
  teamId: string;
}

const SignedOutView = (props: SignedOutViewProps): HomeView => {
  const { user, teamId } = props;
  return {
    type: "home",
    blocks: [
      {
        type: "actions",
        elements: [
          {
            type: "button",
            text: {
              type: "plain_text",
              text: "Sign in with Vercel",
            },
            accessibility_label: "Sign in with Vercel",
            url: getSignInUrl(user, teamId),
            action_id: "sign-in-action",
          },
        ],
      },
    ],
  };
};

interface RenderAppHomeViewProps {
  userId: string;
  teamId: string;
  session: Session | null;
}

// Try to always update the app home view with this function, don't use client.views.publish directly.
// This will ensure the state of the app home view is always correct.
export const renderAppHomeView = async (
  props: RenderAppHomeViewProps,
): Promise<void> => {
  const { userId, teamId, session } = props;
  try {
    let view: HomeView;

    if (!session) {
      view = SignedOutView({
        user: userId,
        teamId: teamId,
      });
    } else {
      const [scopesResult, userResult] = await Promise.all([
        userGetScopes({
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        }),
        userGet({
          headers: {
            Authorization: `Bearer ${session.token}`,
          },
        }),
      ]);

      const { data: scopes, error: scopesError } = scopesResult;
      const { data: userData, error: userGetError } = userResult;

      if (userGetError || scopesError) {
        app.logger.error("Failed to get user data:", userGetError);
        await deleteSession(teamId, userId);
        // rethrow the error
        throw userGetError || scopesError;
      }

      view = SignedInView({
        user: {
          username: userData.name,
          email: userData.email,
          avatar: userData.avatar,
        },
        teams: scopes.data.map((team) => ({ id: team.id, name: team.name })),
        selectedTeam:
          session.selectedTeamId && session.selectedTeamName
            ? {
                id: session.selectedTeamId,
                name: session.selectedTeamName,
              }
            : null,
      });
    }

    await app.client.views.publish({
      view,
      user_id: userId,
    });
  } catch (error) {
    app.logger.error("Failed to render app home view:", error);

    await app.client.views.publish({
      view: SignedOutView({
        user: userId,
        teamId: teamId,
      }),
      user_id: userId,
    });
  }
};
