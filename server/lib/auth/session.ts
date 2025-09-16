export interface Session {
  slackUserId: string;
  token: string;
  createdAt: number;
  expiresAt?: number;
}

const SESSION_PREFIX = "session:";
const DEFAULT_TTL_HOURS = 24 * 7; // 7 days

export async function createSession(
  slackUserId: string,
  token: string,
  expiresIn?: number,
): Promise<Session> {
  const now = Date.now();
  const session: Session = {
    slackUserId,
    token,
    createdAt: now,
    expiresAt: expiresIn
      ? now + expiresIn * 1000
      : now + DEFAULT_TTL_HOURS * 60 * 60 * 1000,
  };

  const storage = useStorage("redis");
  await storage.setItem(`${SESSION_PREFIX}${slackUserId}`, session);

  return session;
}

export async function getSession(slackUserId: string): Promise<Session | null> {
  const storage = useStorage("redis");
  const session = await storage.getItem<Session>(
    `${SESSION_PREFIX}${slackUserId}`,
  );

  if (!session) return null;

  if (session.expiresAt && Date.now() > session.expiresAt) {
    await deleteSession(slackUserId);
    return null;
  }

  return session;
}

export async function deleteSession(slackUserId: string): Promise<void> {
  const storage = useStorage("redis");
  await storage.removeItem(`${SESSION_PREFIX}${slackUserId}`);
}
