import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/web-api";
import { getChatIDFromThread } from "~/lib/redis";
import { V0_URL_REGEX } from "~/lib/slack/utils";

const v0UrlsInMessageEvent = (event: GenericMessageEvent) => {
  // Example:'<https://v0.app/chat/u8kGDoUQBNM>' or '<https://v0.app/chat/u8kGDoUQBNM|here>'
  const { text } = event;
  if (!text) return [];

  const v0UrlRegex = V0_URL_REGEX;
  const urlMatches = Array.from(text.matchAll(v0UrlRegex));
  return urlMatches.map((match) => match[0]);
};

export const urlSharedMiddleware = async ({
  event,
  next,
  client,
  logger,
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & {
    event: GenericMessageEvent;
  }): Promise<void> => {
  const { text } = event;

  if (!text) {
    next();
    return;
  }

  const v0Urls = v0UrlsInMessageEvent(event);
  if (v0Urls.length === 0) {
    next();
    return;
  }

  const uniqueV0Urls = Array.from(new Set(v0Urls));
  if (uniqueV0Urls.length === 0) {
    next();
    return;
  }

  logger.info("Running url shared middleware with v0 urls:", {
    v0Urls: uniqueV0Urls,
  });
  for (const v0Url of uniqueV0Urls) {
    await client.chat.postEphemeral({
      channel: event.channel,
      user: event.user,
      thread_ts: event.thread_ts,
      blocks: [
        {
          type: "section",
          text: {
            type: "plain_text",
            text: `You have shared a chat that may not be visible to the channel`,
          },
          accessory: {
            type: "button",
            text: {
              type: "plain_text",
              text: "Open in v0",
            },
            url: `${v0Url}`,
          },
        },
      ],
      text: `You have shared a chat that may not be visible to everyone.`,
    });
  }
  next();
};

export const directMessageMiddleware = async ({
  event,
  next,
  context,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">) => {
  if (event.channel_type !== "im") {
    next();
    return;
  }

  if (event.subtype && event.subtype !== "file_share") {
    next();
    return;
  }

  event = event as GenericMessageEvent;

  const { session } = context;
  if (!session) {
    next();
    return;
  }

  logger.info("Running direct message middleware for event type:", {
    eventType: event.type,
  });

  const chatId = await getChatIDFromThread(event.thread_ts);

  const isNewChat = !chatId;

  context.chatId = chatId;
  context.isNewChat = isNewChat;

  logger.info("Direct message middleware adding context to event: ", {
    chatId,
    isNewChat,
  });
  next();
};
