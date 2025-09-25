import { redis } from "../redis";

export interface Session {
  slackUserId: string;
  token: string;
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
  expiresIn?: number;
};

export async function createSession({
  slackUserId,
  token,
  expiresIn,
}: CreateSessionParams): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    slackUserId,
    token,
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
    await deleteSession(slackUserId);
    return null;
  }

  return session;
}

export async function deleteSession(slackUserId: string): Promise<void> {
  await redis.del(`${SESSION_PREFIX}${slackUserId}`);
}
