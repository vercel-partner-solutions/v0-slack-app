import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { buttonActionOrPlainTextInputAction } from "~/lib/slack/utils";

export const removeActionCallback = async ({
  ack,
  logger,
  action,
  client,
  body,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();
    if (!buttonActionOrPlainTextInputAction(action)) {
      logger.error("No value found in remove action");
      return;
    }

    const chatId = action.value;
    const message = body.message;

    if (!message) {
      logger.error("No message found in remove action");
      return;
    }

    logger.info(`Removing message for chat ${chatId}`);

    // Delete the message
    await client.chat.delete({
      channel: body.channel?.id || "",
      ts: message.ts,
    });
  } catch (error) {
    logger.error("Failed to handle remove action:", error);
  }
};
