import { OAuth2Client } from "arctic";
import { app } from "~/app";
import { redis } from "~/lib/redis";
import { SCOPES, TOKEN_PATH } from "./constants";

export interface Session {
  slackUserId: string;
  token: string;
  refreshToken?: string;
  createdAt: number;
  expiresAt?: number;
  selectedTeamId?: string;
  selectedTeamName?: string;
}

const SESSION_PREFIX = "session:";
const DEFAULT_TTL_HOURS = 24 * 7; // 7 days

type CreateSessionParams = {
  slackUserId: string;
  token: string;
  refreshToken?: string;
  expiresIn?: number;
};

export async function createSession({
  slackUserId,
  token,
  refreshToken,
  expiresIn,
}: CreateSessionParams): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    slackUserId,
    token,
    refreshToken,
    createdAt: now,
    expiresAt: expiresIn
      ? now + expiresIn * 1000
      : now + DEFAULT_TTL_HOURS * 60 * 60 * 1000,
  };

  await redis.set(`${SESSION_PREFIX}${slackUserId}`, session);

  return session;
}

export async function getSession(slackUserId: string): Promise<Session | null> {
  const session = await redis.get<Session>(`${SESSION_PREFIX}${slackUserId}`);

  if (!session) return null;

  if (session.expiresAt && Date.now() > session.expiresAt) {
    if (session.refreshToken) {
      const refreshedTokens = await refreshAccessToken(session.refreshToken);

      if (refreshedTokens) {
        const updatedSession: Session = {
          ...session,
          token: refreshedTokens.accessToken,
          refreshToken: refreshedTokens.refreshToken || session.refreshToken,
          expiresAt: refreshedTokens.expiresAt,
        };

        await redis.set(`${SESSION_PREFIX}${slackUserId}`, updatedSession);
        return updatedSession;
      }
    }

    await deleteSession(slackUserId);
    return null;
  }

  return session;
}

export async function deleteSession(slackUserId: string): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${slackUserId}`);
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
} | null> {
  try {
    const client = new OAuth2Client(
      process.env.VERCEL_CLIENT_ID ?? "",
      process.env.VERCEL_CLIENT_SECRET ?? "",
      "",
    );
    const tokens = await client.refreshAccessToken(
      TOKEN_PATH,
      refreshToken,
      SCOPES,
    );

    return {
      accessToken: tokens.accessToken(),
      refreshToken: tokens.refreshToken() || refreshToken, // Use new refresh token if provided, fallback to old one
      expiresAt: tokens.accessTokenExpiresAt().getTime(),
    };
  } catch (error) {
    app.logger.error("Failed to refresh access token:", error);
    return null;
  }
}
