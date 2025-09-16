import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";

export const signInActionCallback = async ({
  ack,
  logger,
  client,
  body,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();

    await client.views.publish({
      user_id: body.user.id,
      view: {
        type: "home",
        blocks: [
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: `*Welcome home, <@${body.user.id}> :house:*`,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: "Learn how home tabs can be more useful and interactive <https://api.slack.com/surfaces/tabs/using|*in the documentation*>.",
            },
          },

          {
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
        ],
      },
    });
  } catch (error) {
    logger.error("Login action callback failed:", error);
  }
};
