import {
  CodeChallengeMethod,
  generateCodeVerifier,
  generateState,
  OAuth2Client,
} from "arctic";
import { app } from "~/app";
import { AUTHORIZE_PATH, REDIRECT_PATH } from "~/lib/auth/constants";
import { getSession } from "~/lib/auth/session";
import { redirectToSlackHome } from "~/lib/slack/utils";

const VERCEL_CLIENT_ID = process.env.VERCEL_CLIENT_ID;
const VERCEL_CLIENT_SECRET = process.env.VERCEL_CLIENT_SECRET;
const COOKIE_MAX_AGE = 60 * 10; // 10 minutes
const SCOPES = ["openid"];

export default defineEventHandler(async (event): Promise<void> => {
  const query = getQuery(event);
  const slackUserId = query.slack_user_id as string;
  const slackTeamId = query.team_id as string;
  const slackAppId = query.app_id as string;

  if (!slackUserId) {
    return sendError(
      event,
      createError({
        statusCode: 400,
        statusMessage: "Slack user ID is required",
      }),
    );
  }

  const session = await getSession(slackUserId);

  if (session) {
    app.logger.info("User already signed in, redirecting to Slack home", {
      slackUserId,
      slackTeamId,
      slackAppId,
      session,
    });
    return redirectToSlackHome(event, slackTeamId, slackAppId);
  }

  const eventUrl = getRequestURL(event);
  const { protocol, host } = eventUrl;
  const redirectUrl = new URL(REDIRECT_PATH, `${protocol}//${host}`).toString();

  if (!VERCEL_CLIENT_ID || !VERCEL_CLIENT_SECRET) {
    return sendError(
      event,
      createError({
        statusCode: 500,
        statusMessage: "Missing Vercel OAuth credentials",
      }),
    );
  }

  const client = new OAuth2Client(
    VERCEL_CLIENT_ID,
    VERCEL_CLIENT_SECRET,
    redirectUrl,
  );

  const state = generateState();
  const verifier = generateCodeVerifier();
  const url = client.createAuthorizationURLWithPKCE(
    AUTHORIZE_PATH,
    state,
    CodeChallengeMethod.S256,
    verifier,
    SCOPES,
  );

  const next = query.next as string | undefined;

  const redirectTo = next?.startsWith("/") ? next : "/";

  const cookieOptions = {
    path: "/",
    secure: process.env.NODE_ENV === "production",
    httpOnly: true,
    maxAge: COOKIE_MAX_AGE,
    sameSite: "lax" as const,
  };

  setCookie(event, "vercel_oauth_redirect_to", redirectTo, cookieOptions);
  setCookie(event, "vercel_oauth_state", state, cookieOptions);
  setCookie(event, "vercel_oauth_code_verifier", verifier, cookieOptions);
  setCookie(event, "slack_user_id", slackUserId, cookieOptions);

  return sendRedirect(event, url.toString(), 302);
});
