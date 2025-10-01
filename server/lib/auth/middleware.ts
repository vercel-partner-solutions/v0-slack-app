import type { AllMiddlewareArgs } from "@slack/bolt";
import { getSession, type Session } from "./session";

// Events that require authentication - properly typed
const authEventsMatcher = [
  "app_mention",
  "message",
  "block_actions",
  "slash_command",
] as const;

type AuthEventType = (typeof authEventsMatcher)[number];

/**
 * Global middleware that adds session to context for specific events
 * Use with: app.use(authMiddleware)
 */
export const authMiddleware = async ({
  context,
  next,
  logger,
  ...args
}: AllMiddlewareArgs) => {
  // Check if this event type needs authentication
  const eventType =
    (args as any).event?.type ||
    (args as any).body?.type ||
    (args as any).body?.event?.type;

  if (!authEventsMatcher.includes(eventType as AuthEventType)) {
    // Skip auth for events that don't need it
    logger.info("Skipping auth middlewarefor event type", { eventType });
    await next();
    return;
  }

  // Skip bot messages
  const isBotMessage =
    (args as any).event?.bot_id ||
    (args as any).event?.subtype === "bot_message";
  if (isBotMessage) {
    logger.info("Skipping auth middleware for bot message", { eventType });
    await next();
    return;
  }

  logger.info("Running auth middleware for event type", { eventType });
  const { teamId, userId } = context;

  let session: Session | null = null;

  if (teamId && userId) {
    try {
      session = await getSession(teamId, userId);
    } catch (_error) {
      // Session error - user is not authenticated
      session = null;
    }
  }

  // Attach session to context
  context.session = session;
  await next();
};
