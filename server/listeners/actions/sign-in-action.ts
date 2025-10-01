import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { getSession } from "~/lib/auth/session";
import { renderAppHomeView, SignedInLoadingView } from "~/lib/slack/ui/home";

export const signInActionCallback = async ({
  ack,
  logger,
  context,
  client,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();
    const { userId, teamId } = context;

    logger.info(
      "Sign-in action triggered, setting loading state and starting polling:",
      {
        userId,
        teamId,
      },
    );

    // Step 1: Immediately set loading state
    await client.views.publish({
      user_id: userId,
      view: SignedInLoadingView(),
    });

    logger.info("Loading state published, starting session polling");

    // Step 2: Start polling for session creation
    pollForSessionAndUpdateView(userId, teamId, logger);
  } catch (error) {
    logger.error("Sign-in action callback failed:", error);
  }
};

/**
 * Polls for session creation and updates the home view when found
 */
async function pollForSessionAndUpdateView(
  userId: string,
  teamId: string,
  logger: {
    info: (message: string, meta?: Record<string, unknown>) => void;
    error: (message: string, error?: unknown) => void;
    warn: (message: string, meta?: Record<string, unknown>) => void;
  },
): Promise<void> {
  const maxAttempts = 30; // 30 attempts with exponential backoff = ~15 seconds
  const baseInterval = 200; // Start with 200ms

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      logger.info(`Polling for session (attempt ${attempt}/${maxAttempts}):`, {
        userId,
        teamId,
      });

      const session = await getSession(teamId, userId);

      if (session) {
        logger.info("Session found, updating app home view:", {
          userId,
          teamId,
          hasSession: !!session,
        });

        await renderAppHomeView({
          userId,
          teamId,
          session,
        });

        logger.info("Successfully updated app home view after sign-in");
        return; // Success! Exit the polling loop
      }

      // Exponential backoff: start fast, then slow down
      if (attempt < maxAttempts) {
        const delay = Math.min(baseInterval * Math.pow(1.2, attempt - 1), 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    } catch (error) {
      logger.error(`Error during session polling (attempt ${attempt}):`, error);

      // If it's a session error (not found), continue polling
      // If it's a different error, we might want to stop
      if (attempt < maxAttempts) {
        const delay = Math.min(baseInterval * Math.pow(1.2, attempt - 1), 1000);
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  // Step 3: If polling fails or times out, publish the sign-in view
  logger.warn(
    "Session polling timed out after ~15 seconds, showing sign-in view:",
    {
      userId,
      teamId,
    },
  );

  try {
    await renderAppHomeView({
      userId,
      teamId,
      session: null, // This will show the signed-out view with sign-in button
    });
    logger.info("Successfully published sign-in view after timeout");
  } catch (error) {
    logger.error(
      "Failed to publish sign-in view after polling timeout:",
      error,
    );
  }
}
