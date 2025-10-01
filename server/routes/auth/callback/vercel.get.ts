import { OAuth2Client, type OAuth2Tokens } from "arctic";
import type { EventHandlerRequest, H3Event } from "h3";
import { app } from "~/app";
import { REDIRECT_PATH, TOKEN_PATH } from "~/lib/auth/constants";
import { createSession } from "~/lib/auth/session";

export default defineEventHandler(async (event) => {
  const { code, state, error, error_description } =
    parseOAuthCallbackParams(event);

  if (error || error_description) {
    return new Response(null, { status: 400 });
  }

  const storedState = getCookie(event, "vercel_oauth_state") ?? null;
  const storedVerifier = getCookie(event, "vercel_oauth_code_verifier") ?? null;
  const storedRedirectTo = getCookie(event, "vercel_oauth_redirect_to") ?? null;
  const storedSlackUserId = getCookie(event, "slack_user_id") ?? null;
  const storedSlackTeamId = getCookie(event, "slack_team_id") ?? null;

  if (
    !isValidOAuthCallbackParams(
      code,
      state,
      storedState,
      storedRedirectTo,
      storedVerifier,
      storedSlackUserId,
      storedSlackTeamId,
    )
  ) {
    return new Response("Invalid OAuth callback parameters", { status: 400 });
  }

  const eventUrl = getRequestURL(event);
  const { protocol, host } = eventUrl;
  const callbackUrl = new URL(REDIRECT_PATH, `${protocol}//${host}`).toString();

  const client = new OAuth2Client(
    process.env.VERCEL_CLIENT_ID ?? "",
    process.env.VERCEL_CLIENT_SECRET ?? "",
    callbackUrl,
  );

  let tokens: OAuth2Tokens;
  try {
    tokens = await client.validateAuthorizationCode(
      TOKEN_PATH,
      code,
      storedVerifier,
    );
  } catch (_error) {
    app.logger.error("Error validating authorization code:", _error);
    return new Response("Error validating authorization code", { status: 400 });
  }

  try {
    await createSession({
      slackUserId: storedSlackUserId,
      slackTeamId: storedSlackTeamId,
      token: tokens.accessToken(),
      refreshToken: tokens.refreshToken(),
      expiresIn: Math.max(
        0,
        Math.floor(
          (tokens.accessTokenExpiresAt().getTime() - Date.now()) / 1000,
        ),
      ),
    });

    const { renderAppHomeView } = await import("~/lib/slack/ui/home");
    await renderAppHomeView({
      userId: storedSlackUserId,
      teamId: storedSlackTeamId,
    });
    // Update the app home view to reflect the signed-in state
  } catch (error) {
    app.logger.error("Failed to create session:", error);
    return new Response(null, { status: 500 });
  }

  // Clean up OAuth cookies
  deleteCookie(event, "vercel_oauth_state");
  deleteCookie(event, "vercel_oauth_code_verifier");
  deleteCookie(event, "vercel_oauth_redirect_to");
  deleteCookie(event, "slack_user_id");
  deleteCookie(event, "slack_team_id");

  return sendRedirect(event, "slack://open", 302);
});

const isValidOAuthCallbackParams = (
  code: string | null,
  state: string | null,
  storedState: string | null,
  storedRedirectTo: string | null,
  storedVerifier: string | null,
  storedSlackUserId: string | null,
  storedSlackTeamId: string | null,
): boolean => {
  return (
    code !== null &&
    state !== null &&
    storedState === state &&
    storedRedirectTo !== null &&
    storedVerifier !== null &&
    storedSlackUserId !== null &&
    storedSlackTeamId !== null
  );
};

const parseOAuthCallbackParams = (event: H3Event<EventHandlerRequest>) => {
  const query = getQuery(event);
  const { code, state, error, error_description } = query;
  return {
    code: code as string,
    state: state as string,
    error: error as string,
    error_description: error_description as string,
  };
};
