import type { App } from "@slack/bolt";
import { onlyChannelType } from "~/lib/slack/utils";
import { directMessageCallback } from "./direct-message";
import { middleware } from "./middleware";

const register = (app: App) => {
  app.message(async ({ event, next, logger }) => {
    logger.debug("🔔 Message event received!");
    logger.debug(
      `Channel type: ${event.channel_type}, Subtype: ${event.subtype || "none"}`,
    );
    if ("text" in event) {
      logger.debug(`Text: ${event.text?.substring(0, 100)}`);
    }
    await next();
  });

  app.message(onlyChannelType("im"), directMessageCallback);
  app.message(middleware);
  // We handle public channel, private channel, and group messages in the app_mention event listener to keep noise down
  // app.message(onlyChannelType("channel"), channelMessageCallback);
  // app.message(onlyChannelType("group"), groupMessageCallback);
  // app.message(onlyChannelType("mpim"), mpimMessageCallback);
};

export default { register };
