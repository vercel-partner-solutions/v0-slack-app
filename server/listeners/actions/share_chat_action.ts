import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { chatsUpdate } from "~/lib/v0/client/sdk.gen";

export const shareChatActionCallback = async ({
  ack,
  logger,
  action,
  context,
  body,
  respond,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  logger.info("Share chat action clicked", {
    action,
    body,
  });
  const { session } = context;

  // @ts-expect-error - value is part of the BlockAction type
  const { value } = action;
  try {
    await ack();
    if (value) {
      const { data, error } = await chatsUpdate({
        path: {
          chatId: value,
        },
        body: {
          privacy: "team-edit",
        },
        headers: {
          Authorization: `Bearer ${session?.token}`,
          "X-Scope": session?.selectedTeamId,
          "x-v0-client": "slack",
        },
      });
      if (error) {
        throw new Error(error.error.message, { cause: error.error.type });
      }
      logger.info("Chat privacy updated", {
        chatId: data.id,
      });
      await respond({
        text: "Chat has been shared with your team!",
        replace_original: true,
      });
    }
  } catch (error) {
    logger.error("Failed to ack share chat action:", error);
    await respond({
      text: "Failed to share chat with your team.",
      replace_original: true,
    });
  }
};
