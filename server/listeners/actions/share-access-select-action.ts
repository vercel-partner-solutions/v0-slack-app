import type {
  AllMiddlewareArgs,
  BlockAction,
  SlackActionMiddlewareArgs,
} from "@slack/bolt";
import { isValidPrivacy, PRIVACY_LABELS } from "~/lib/constants";
import { chatsUpdate } from "~/lib/v0/client/sdk.gen";

export const shareAccessSelectActionCallback = async ({
  ack,
  logger,
  action,
  context,
  body,
  respond,
}: AllMiddlewareArgs & SlackActionMiddlewareArgs<BlockAction>) => {
  logger.info("Share access select action clicked", {
    action,
    body,
  });
  const { session } = context;

  // @ts-expect-error - selected_option is part of the BlockAction type for static_select
  const { selected_option } = action;

  try {
    if (!selected_option?.value) {
      logger.warn("No value selected");
      return;
    }

    const value = selected_option.value;

    // Parse the value format: {newPrivacy}_{originalPrivacy}_{chatId}
    const parts = value.split("_");
    const chatId = parts[parts.length - 1];
    const originalPrivacy = parts[parts.length - 2];
    const privacy = parts.slice(0, -2).join("_");

    // Validate privacy levels
    if (!isValidPrivacy(privacy)) {
      await ack();
      logger.error("Invalid privacy level", { privacy, chatId });
      await respond({
        text: "Invalid privacy level selected.",
        replace_original: true,
      });
      return;
    }

    if (!isValidPrivacy(originalPrivacy)) {
      await ack();
      logger.error("Invalid original privacy level", {
        originalPrivacy,
        chatId,
      });
      await respond({
        text: "Invalid original privacy level.",
        replace_original: true,
      });
      return;
    }

    // Check if privacy is already set to the selected value
    if (originalPrivacy === privacy) {
      await ack();
      logger.info("Privacy already set to selected value", { chatId, privacy });
      await respond({
        text: `This chat is already set to: ${PRIVACY_LABELS[privacy]}`,
        replace_original: true,
      });
      return;
    }

    logger.info("Updating chat privacy", {
      chatId,
      privacy,
      originalPrivacy,
    });

    const timeout = setTimeout(() => {
      ack();
    }, 2500);

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

    logger.info("Chat privacy updated", {
      chatId: data.id,
      privacy: data.privacy,
      originalPrivacy,
    });

    await respond({
      text: `✓ Chat privacy updated to: ${PRIVACY_LABELS[privacy] || privacy}`,
      replace_original: true,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `✓ Chat privacy updated to: *${PRIVACY_LABELS[privacy] || privacy}*`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Undo",
                emoji: false,
              },
              action_id: "undo_share_action",
              value: `${originalPrivacy}_${chatId}`,
              style: "primary",
            },
          ],
        },
      ],
    });
  } catch (error) {
    logger.error("Failed to update chat privacy:", error);
    await respond({
      text: "Failed to update chat privacy.",
      replace_original: true,
    });
  }
};
