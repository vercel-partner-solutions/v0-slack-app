import type {
  AllMiddlewareArgs,
  Middleware,
  SlackEventMiddlewareArgs,
} from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/web-api";
import { isV0ChatUrl } from "~/lib/slack/utils";

const urlRegex = /<?(https?:\/\/[^\s>]+)>?/g;

const urlSharedMiddleware = async ({
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

  const urlMatches = Array.from(text.matchAll(urlRegex));
  if (urlMatches.length === 0) {
    return;
  }

  const urls = urlMatches.map((match) => match[1]);
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
                  text: "Open chat in v0",
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
  }
  await next();
};

const composeMiddleware = (
  middlewares: Middleware<
    AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">
  >[],
) => {
  return async (
    args: AllMiddlewareArgs & SlackEventMiddlewareArgs<"message">,
  ) => {
    for (const middleware of middlewares) {
      await middleware(args);
    }
  };
};

export const middleware = composeMiddleware([urlSharedMiddleware]);
