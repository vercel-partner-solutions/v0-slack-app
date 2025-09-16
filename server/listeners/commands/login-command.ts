import type {
  AllMiddlewareArgs,
  SlackCommandMiddlewareArgs,
} from "@slack/bolt";

export const loginCommandCallback = async ({
  ack,
  respond,
  logger,
  payload
}: AllMiddlewareArgs & SlackCommandMiddlewareArgs) => {
  const { user_id } = payload;
  try {
    await ack();
    await respond({
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: "Click here to sign in to v0"
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Sign In",
              emoji: true
            },
            value: "sign-in",
            url: "http://localhost:3000/sign-in",
            action_id: "sign-in-action"
          }
        }
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
