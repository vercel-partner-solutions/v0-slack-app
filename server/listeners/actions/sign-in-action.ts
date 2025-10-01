import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { renderAppHomeView } from "~/lib/slack/ui/home";

export const signInActionCallback = async ({
  ack,
  logger,
  context,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();
    const { userId, teamId, session } = context;

    await renderAppHomeView({
      userId,
      teamId,
      session,
    });
  } catch (error) {
    logger.error("Login action callback failed:", error);
  }
};
