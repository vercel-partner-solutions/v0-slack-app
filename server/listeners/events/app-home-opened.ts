import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { getSession } from "~/lib/auth/session";

const appHomeOpenedCallback = async ({
  client,
  event,
  logger,
  payload,
  body,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_home_opened">) => {
  // Ignore the `app_home_opened` event for anything but the Home tab
  if (event.tab !== "home") return;

  const session = await getSession(payload.user);

  try {
    await client.views.publish({
      user_id: event.user,
      view: {
        type: "home",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Welcome home, <@${event.user}> :house:*`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Learn how home tabs can be more useful and interactive <https://api.slack.com/surfaces/tabs/using|*in the documentation*>.",
            },
          },

          session
            ? {
                type: "section",
                text: {
                  type: "mrkdwn",
                  text: "Click here to sign out of v0",
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
              }
            : {
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
                  url: `http://localhost:3000/sign-in?slack_user_id=${body.event.user}&team_id=${body.team_id}&app_id=${body.api_app_id}`,
                },
              },
        ],
      },
    });
  } catch (error) {
    logger.error("app_home_opened handler failed:", error);
  }
};

export default appHomeOpenedCallback;
