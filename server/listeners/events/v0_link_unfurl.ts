import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { LinkSharedEvent } from "@slack/web-api";
import { app } from "~/app";
import { getSession, type Session } from "~/lib/auth/session";
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

  const privateChatIds = [];

  for (const chat of chatResults) {
    if (chat.status === "fulfilled" && chat.value.data.privacy === "private") {
      privateChatIds.push(chat.value.data.id);
    }
  }

  for (const chatId of privateChatIds) {
    await client.chat.postEphemeral({
      channel: event.channel,
      thread_ts: event.thread_ts,
      user: event.user,
      blocks: [
        {
          type: "section",
          text: {
            type: "mrkdwn",
            text: `This chat isn't available to your whole team.`,
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Share",
            },
            action_id: "share_chat_action",
            value: chatId,
          },
        },
        {
          type: "context",
          elements: [
            {
              type: "mrkdwn",
              text: "This will grant _team edit_ access to the chat.",
            },
          ],
        },
      ],
      text: `This chat isn't available to your whole team.`,
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
