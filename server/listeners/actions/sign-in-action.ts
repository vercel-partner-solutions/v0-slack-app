import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { SignedInLoadingView } from "~/lib/slack/ui/home";

export const signInActionCallback = async ({
  ack,
  logger,
  context,
  client,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();
    const { userId, teamId } = context;

    logger.info("Sign-in action triggered, setting loading state:", {
      userId,
      teamId,
    });

    // Publish loading view
    await client.views.publish({
      user_id: userId,
      view: SignedInLoadingView(),
    });

    logger.info("Loading state published successfully");
  } catch (error) {
    logger.error("Sign-in action callback failed:", error);
  }
};
