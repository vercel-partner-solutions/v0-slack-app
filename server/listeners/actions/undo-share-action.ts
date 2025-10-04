import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { isValidPrivacy, PRIVACY_LABELS } from "~/lib/constants";
import { chatsUpdate } from "~/lib/v0/client/sdk.gen";

export const undoShareActionCallback = async ({
  ack,
  logger,
  action,
  context,
  respond,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  logger.info("Undo share action clicked", {
    action,
  });
  const { session } = context;

  // @ts-expect-error - value is part of the BlockAction type
  const { value } = action;

  if (!value) {
    logger.warn("No value provided for undo");
    await ack();
    return;
  }

  // Parse the value format: {privacy}_{chatId}
  const parts = value.split("_");
  const chatId = parts[parts.length - 1];
  const privacy = parts.slice(0, -1).join("_");

  // Validate privacy level
  if (!isValidPrivacy(privacy)) {
    logger.error("Invalid privacy level for undo", { privacy, chatId });
    await ack();
    await respond({
      text: "Invalid privacy level.",
      replace_original: true,
    });
    return;
  }

  logger.info("Undoing chat privacy change", {
    chatId,
    privacy,
  });

  const timeout = setTimeout(() => {
    ack();
  }, 2500);

  try {
    const { data, error } = await chatsUpdate({
      path: {
        chatId,
      },
      body: {
        privacy,
      },
      headers: {
        Authorization: `Bearer ${session?.token}`,
        "X-Scope": session?.selectedTeamId,
        "x-v0-client": "slack",
      },
    });

    clearTimeout(timeout);
    if (error) {
      throw new Error(error.error.message, { cause: error.error.type });
    }

    logger.info("Chat privacy reverted", {
      chatId: data.id,
      privacy: data.privacy,
    });

    await respond({
      text: `↩️ Undone. Chat privacy restored to: ${PRIVACY_LABELS[privacy] || privacy}`,
      replace_original: true,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `↩️ *Undone*\n\nChat privacy restored to: *${PRIVACY_LABELS[privacy] || privacy}*`,
          },
        },
      ],
    });
  } catch (error) {
    logger.error("Failed to undo chat privacy change:", error);
    await respond({
      text: "Failed to undo the privacy change.",
      replace_original: true,
    });
  }
};
