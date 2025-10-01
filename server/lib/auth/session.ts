import { OAuth2Client } from "arctic";
import { app } from "~/app";
import { redis } from "~/lib/redis";
import { SCOPES, TOKEN_PATH } from "./constants";

export interface Session {
  slackUserId: string;
  slackTeamId: string;
  token: string;
  refreshToken?: string;
  createdAt: number;
  expiresAt?: number;
  selectedTeamId?: string;
  selectedTeamName?: string;
}

export const SESSION_PREFIX = "session:";
const DEFAULT_TTL_HOURS = 24 * 7; // 7 days

function getSessionKey(slackTeamId: string, slackUserId: string): string {
  return `${SESSION_PREFIX}${slackTeamId}:${slackUserId}`;
}

function isSessionExpired(session: Session): boolean {
  return !!session.expiresAt && Date.now() > session.expiresAt;
}

function calculateExpiresAt(expiresIn?: number): number {
  const now = Date.now();
  return expiresIn
    ? now + expiresIn * 1000
    : now + DEFAULT_TTL_HOURS * 60 * 60 * 1000;
}

async function saveSessionToStorage(
  slackTeamId: string,
  slackUserId: string,
  session: Session,
): Promise<void> {
  try {
    await redis.set(getSessionKey(slackTeamId, slackUserId), session);
  } catch (error) {
    throw new SessionStorageError("Failed to save session to storage", error);
  }
}

async function handleExpiredSession(
  slackTeamId: string,
  slackUserId: string,
  session: Session,
): Promise<Session | null> {
  // Try to refresh if we have a refresh token
  if (session.refreshToken) {
    try {
      const refreshedTokens = await refreshAccessToken(session.refreshToken);

      const updatedSession: Session = {
        ...session,
        token: refreshedTokens.accessToken,
        refreshToken: refreshedTokens.refreshToken || session.refreshToken,
        expiresAt: refreshedTokens.expiresAt,
      };

      await saveSessionToStorage(slackTeamId, slackUserId, updatedSession);
      app.logger.info(`Session refreshed for ${slackTeamId}:${slackUserId}`);
      return updatedSession;
    } catch (error) {
      if (error instanceof SessionStorageError) {
        throw error;
      }
      app.logger.error("Failed to refresh token:", error);
      // Continue to delete expired session
    }
  }

  // Session expired and couldn't refresh, delete it
  app.logger.info(`Session expired for ${slackTeamId}:${slackUserId}`);
  try {
    await deleteSession(slackTeamId, slackUserId);
  } catch (error) {
    app.logger.error("Failed to delete expired session:", error);
  }
  return null;
}

export class SessionError extends Error {
  constructor(
    message: string,
    public code: string,
    public details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "SessionError";
  }
}

export class SessionValidationError extends SessionError {
  constructor(message: string, details?: Record<string, unknown>) {
    super(message, "VALIDATION_ERROR", details);
    this.name = "SessionValidationError";
  }
}

export class SessionNotFoundError extends SessionError {
  constructor(slackTeamId: string, slackUserId: string) {
    super("Session not found", "NOT_FOUND", { slackTeamId, slackUserId });
    this.name = "SessionNotFoundError";
  }
}

export class SessionStorageError extends SessionError {
  constructor(message: string, cause?: unknown) {
    super(message, "STORAGE_ERROR", { cause });
    this.name = "SessionStorageError";
  }
}

export class SessionExpiredError extends SessionError {
  constructor(slackTeamId: string, slackUserId: string) {
    super("Session has expired", "EXPIRED", { slackTeamId, slackUserId });
    this.name = "SessionExpiredError";
  }
}

export class TokenRefreshError extends SessionError {
  constructor(message: string, cause?: unknown) {
    super(message, "TOKEN_REFRESH_ERROR", { cause });
    this.name = "TokenRefreshError";
  }
}

type CreateSessionParams = {
  slackUserId: string;
  slackTeamId: string;
  token: string;
  refreshToken?: string;
  expiresIn?: number;
};

export async function createSession({
  slackUserId,
  slackTeamId,
  token,
  refreshToken,
  expiresIn,
}: CreateSessionParams): Promise<Session> {
  if (!slackUserId || !slackTeamId || !token) {
    throw new SessionValidationError(
      "slackUserId, slackTeamId, and token are required to create a session",
      { slackUserId, slackTeamId, hasToken: !!token },
    );
  }

  const session: Session = {
    slackUserId,
    slackTeamId,
    token,
    refreshToken,
    createdAt: Date.now(),
    expiresAt: calculateExpiresAt(expiresIn),
  };

  await saveSessionToStorage(slackTeamId, slackUserId, session);
  app.logger.info(`Session created for ${slackTeamId}:${slackUserId}`);
  return session;
}

export async function getSession(
  slackTeamId: string,
  slackUserId: string,
): Promise<Session | null> {
  let session: Session | null;

  // Try to get the session from storage
  try {
    session = await redis.get<Session>(getSessionKey(slackTeamId, slackUserId));
  } catch (error) {
    app.logger.error("Failed to retrieve session from storage:", error);
    throw new SessionStorageError("Failed to retrieve session", error);
  }

  // Session doesn't exist
  if (!session) return null;

  // Handle expired sessions
  if (isSessionExpired(session)) {
    return await handleExpiredSession(slackTeamId, slackUserId, session);
  }

  return session;
}

export async function updateSession(
  slackTeamId: string,
  slackUserId: string,
  updates: Partial<Omit<Session, "slackUserId" | "slackTeamId" | "createdAt">>,
): Promise<Session> {
  try {
    const existingSession = await getSession(slackTeamId, slackUserId);

    if (!existingSession) {
      throw new SessionNotFoundError(slackTeamId, slackUserId);
    }

    const updatedSession: Session = {
      ...existingSession,
      ...updates,
    };

    await saveSessionToStorage(slackTeamId, slackUserId, updatedSession);
    app.logger.info(`Session updated for ${slackTeamId}:${slackUserId}`);
    return updatedSession;
  } catch (error) {
    if (error instanceof SessionError) {
      throw error;
    }
    app.logger.error("Failed to update session:", error);
    throw new SessionStorageError("Failed to update session", error);
  }
}

export async function deleteSession(
  slackTeamId: string,
  slackUserId: string,
): Promise<void> {
  try {
    await redis.del(getSessionKey(slackTeamId, slackUserId));
    app.logger.info(`Session deleted for ${slackTeamId}:${slackUserId}`);
  } catch (error) {
    app.logger.error("Failed to delete session:", error);
    throw new SessionStorageError("Failed to delete session", error);
  }
}

async function refreshAccessToken(refreshToken: string): Promise<{
  accessToken: string;
  refreshToken?: string;
  expiresAt: number;
}> {
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
      refreshToken: tokens.refreshToken() || refreshToken,
      expiresAt: tokens.accessTokenExpiresAt().getTime(),
    };
  } catch (error) {
    app.logger.error("Failed to refresh access token:", error);
    throw new TokenRefreshError("Failed to refresh access token", error);
  }
}
