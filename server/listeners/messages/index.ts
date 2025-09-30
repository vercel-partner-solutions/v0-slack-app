import type {
  AllMiddlewareArgs,
  App,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/web-api";
import { isV0ChatUrl, onlyChannelType } from "~/lib/slack/utils";
import { directMessageCallback } from "./direct-message";

const urlRegex = /https?:\/\/[^\s]+/g;

const sharedUrlMiddleware = async ({
  event,
  next,
  client,
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & {
    event: GenericMessageEvent;
  }): Promise<void> => {
  const { text } = event;

  if (!text) {
    return;
  }

  const urls = text.match(urlRegex) || [];
  if (urls.length === 0) {
    return;
  }

  const uniqueV0Urls = Array.from(
    new Set(urls.filter((url) => isV0ChatUrl(url))),
  );

  const isPublic = event.channel_type === "channel";

  if (isPublic && uniqueV0Urls.length > 0) {
    for (const v0Url of uniqueV0Urls) {
      await client.chat.postEphemeral({
        channel: event.channel,
        user: event.user,
        thread_ts: event.thread_ts,
        blocks: [
          {
            type: "markdown",
            text: `You have shared a chat that may not be visible to everyone.`,
          },
          {
            type: "actions",
            elements: [
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Grant Team access",
                },
                url: `${v0Url}`,
              },
              {
                type: "button",
                text: {
                  type: "plain_text",
                  text: "Open chat settings",
                },
                url: `${v0Url}`,
              },
            ],
          },
          {
            type: "context",
            elements: [
              {
                type: "plain_text",
                text: "This will grant your team edit access to the chat.",
              },
            ],
          },
        ],
        text: `You have shared a chat that may not be visible to everyone.`,
      });
    }
    await next();
  }
};

const register = (app: App) => {
  app.message(onlyChannelType("im"), directMessageCallback);
  app.message(sharedUrlMiddleware);
  // We handle public channel, private channel, and group messages in the app_mention event listener to keep noise down
  // app.message(onlyChannelType("channel"), channelMessageCallback);
  // app.message(onlyChannelType("group"), groupMessageCallback);
  // app.message(onlyChannelType("mpim"), mpimMessageCallback);
};

export default { register };
