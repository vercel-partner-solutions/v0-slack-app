import { app } from "~/app";
import { deleteSession, getSession } from "~/lib/auth/session";
import { redirectToSlackHome } from "~/lib/slack/utils";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);
  const slackUserId = query.slack_user_id as string;
  const slackTeamId = query.team_id as string;
  const slackAppId = query.app_id as string;

  if (!slackUserId) {
    app.logger.error("Slack user tried to sign out without a slack user id");
    return redirectToSlackHome(event, slackTeamId, slackAppId);
  }

  const session = await getSession(slackTeamId, slackUserId);

  if (session?.token) {
    const clientId = process.env.VERCEL_CLIENT_ID ?? "";
    const clientSecret = process.env.VERCEL_CLIENT_SECRET ?? "";
    const basicAuth = Buffer.from(`${clientId}:${clientSecret}`).toString(
      "base64",
    );

    await fetch("https://vercel.com/api/login/oauth/token/revoke", {
      method: "POST",
      body: new URLSearchParams({ token: session.token }),
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${basicAuth}`,
      },
    });
  }

  await deleteSession(slackTeamId, slackUserId);

  deleteCookie(event, "vercel_oauth_state");
  deleteCookie(event, "vercel_oauth_code_verifier");
  deleteCookie(event, "vercel_oauth_redirect_to");
  deleteCookie(event, "slack_user_id");
  deleteCookie(event, "slack_team_id");

  return redirectToSlackHome(event, slackTeamId, slackAppId);
});
