import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { buttonActionOrPlainTextInputAction } from "~/lib/slack/utils";

export const feedbackActionCallback = async ({
  ack,
  logger,
  action,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  try {
    await ack();

    if (!buttonActionOrPlainTextInputAction(action)) {
      logger.error("No value found in feedback action");
      return;
    }

    const value = action.value;
    const [feedback, chatId] = value.split("_");

    logger.info(`Feedback received: ${feedback} for chat ${chatId}`);

    // Here you could store the feedback in a database or send it to an analytics service
    // For now, we'll just log it
  } catch (error) {
    logger.error("Failed to handle feedback action:", error);
  }
};
