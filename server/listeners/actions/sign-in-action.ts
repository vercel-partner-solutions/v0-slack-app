import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { updateAppHomeView } from "~/lib/slack/utils";

export const signInActionCallback = async ({
  ack,
  logger,
  client,
  context,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();
    const { userId, teamId } = context;

    await updateAppHomeView({
      userId,
      teamId,
    });
  } catch (error) {
    logger.error("Login action callback failed:", error);
  }
};
