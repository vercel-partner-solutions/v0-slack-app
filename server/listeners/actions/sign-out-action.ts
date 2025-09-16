import type {
    AllMiddlewareArgs,
    BlockAction,
    SlackActionMiddlewareArgs,
} from "@slack/bolt";

export const signOutActionCallback = async ({
    ack,
    logger,
    body,
    client,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
    try {
        await ack();
        const { user, api_app_id } = body;
        const { id, team_id } = user;

        await $fetch(
            `/sign-out?slack_user_id=${id}&team_id=${team_id}&app_id=${api_app_id}`,
        );

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
                            url: `http://localhost:3000/sign-in?slack_user_id=${body.user.id}&team_id=${body.user.team_id}&app_id=${body.api_app_id}`,
                        },
                    },
                ],
            },
        });
    } catch (error) {
        logger.error("Sign out action callback failed:", error);
    }
};
