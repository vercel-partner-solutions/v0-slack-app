import type { App } from "@slack/bolt";
import { onlyChannelType } from "~/lib/slack/utils";
import { directMessageCallback } from "./direct-message";
import { directMessageMiddleware } from "./middleware";

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

  app.message(
    onlyChannelType("im"),
    directMessageMiddleware,
    directMessageCallback,
  );
};

export default { register };
