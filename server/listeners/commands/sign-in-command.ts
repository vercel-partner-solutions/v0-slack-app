import type {
  AllMiddlewareArgs,
  SlackCommandMiddlewareArgs,
} from "@slack/bolt";

export const signInCommandCallback = async ({
  ack,
  respond,
  logger,
  payload,
}: AllMiddlewareArgs & SlackCommandMiddlewareArgs) => {
  try {
    await ack();
    const user_id = payload.user_id;
    const team_id = payload.team_id;
    const app_id = payload.api_app_id;

    if (!user_id) {
      throw new Error("User ID is required");
    }

    await respond({
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
              emoji: true,
            },
            value: "sign-in",
            url: `http://localhost:3000/sign-in?slack_user_id=${user_id}&team_id=${team_id}&app_id=${app_id}`,
            action_id: "sign-in-action",
          },
        },
      ],
      text: `Hi <@${user_id}>, Click here to login to v0: http://localhost:3000/sign-in`,
    });
  } catch (error) {
    logger.error("Slash command handler failed:", error?.message);
    try {
      await respond({
        text: "Sorry, something went wrong handling that command.",
        response_type: "ephemeral",
      });
    } catch (respondError) {
      logger.error("Also failed to send error response:", respondError);
    }
  }
};
