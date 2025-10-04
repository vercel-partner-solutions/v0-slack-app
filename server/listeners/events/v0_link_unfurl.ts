import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { LinkSharedEvent } from "@slack/web-api";
import { app } from "~/app";
import { getSession, type Session } from "~/lib/auth/session";
import { PRIVACY_LABELS, VALID_PRIVACY_LEVELS } from "~/lib/constants";
import { chatsGetById } from "~/lib/v0/client";

export const v0LinkUnfurlCallback = async ({
  event,
  logger,
  client,
  body,
  context,
}: SlackEventMiddlewareArgs<"link_shared"> & AllMiddlewareArgs) => {
  let { session } = context;

  if (!session) {
    session = await getSession(body.team_id, event.user);
  }

  if (!session) {
    logger.error("No session found");
    return;
  }

  const { links } = event;
  logger.info("Received v0 link unfurl event with links: ", {
    links,
  });

  const chatIds = getChatIdsFromLinks(links);

  const chatResults = await getAllChats(chatIds, session);

  const chatsToWarn: Array<{
    id: string;
    name?: string;
    privacy: string;
  }> = [];

  for (const chat of chatResults) {
    if (
      chat.status === "fulfilled" &&
      chat.value.data.privacy !== "team-edit"
    ) {
      chatsToWarn.push({
        id: chat.value.data.id,
        name: chat.value.data.name || chat.value.data.title,
        privacy: chat.value.data.privacy,
      });
    }
  }

  for (const chat of chatsToWarn) {
    const chatId = chat.id;
    const chatName = chat.name || "Untitled chat";
    const currentPrivacy = chat.privacy;
    const currentPrivacyLabel =
      PRIVACY_LABELS[currentPrivacy] || currentPrivacy;

    await client.chat.postEphemeral({
      channel: event.channel,
      thread_ts: event.thread_ts,
      user: event.user,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `*<https://v0.app/chat/${chatId}|${chatName}>* is currently set to: *${currentPrivacyLabel}*\n\nUpdate the sharing permissions to allow your team to collaborate.\n\n*Choose an option:*`,
          },
        },
        {
          type: "actions",
          elements: [
            {
              type: "static_select",
              placeholder: {
                type: "plain_text",
                text: PRIVACY_LABELS.private,
              },
              action_id: "share_access_select_action",
              options: VALID_PRIVACY_LEVELS.map((level) => ({
                text: {
                  type: "plain_text",
                  text: PRIVACY_LABELS[level],
                },
                value: `${level}_${currentPrivacy}_${chatId}`,
              })),
            },
            {
              type: "button",
              text: {
                type: "plain_text",
                text: "Skip this",
              },
              action_id: "skip_share_action",
            },
          ],
        },
      ],
      text: `We recommend setting this chat to team-edit for the best experience.`,
    });
  }
};

const getChatIdsFromLinks = (links: LinkSharedEvent["links"]) => {
  const chatIds = [];
  for (const link of links) {
    if (link.domain === "v0.app") {
      const path = new URL(link.url).pathname;

      if (!path.startsWith("/chat")) {
        app.logger.info("Received v0 link unfurl event with non-chat path", {
          path,
        });
        continue;
      }

      const fullChatId = path.split("/")[2];
      if (!fullChatId) continue;
      const chatId = fullChatId.split("-").at(-1);

      if (chatId) {
        chatIds.push(chatId);
      }
    } else {
      app.logger.warn("Received link unfurl event with non-v0 domain", {
        link,
      });
    }
  }
  return chatIds;
};

const getAllChats = async (chatIds: string[], session: Session) => {
  const chatPromises = chatIds.map((chatId) =>
    chatsGetById({
      path: { chatId },
      headers: {
        Authorization: `Bearer ${session.token}`,
        "X-Scope": session.selectedTeamId,
        "x-v0-client": "slack",
      },
      throwOnError: true,
    }),
  );
  const chatResults = await Promise.allSettled(chatPromises);
  return chatResults.filter((chat) => chat.status === "fulfilled");
};
