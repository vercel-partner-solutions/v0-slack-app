import type { App } from "@slack/bolt";
import { onlyChannelType } from "~/lib/slack/utils";
import { directMessageCallback } from "./direct-message";
import { directMessageMiddleware, urlSharedMiddleware } from "./middleware";

const register = (app: App) => {
  app.message(
    onlyChannelType("im"),
    directMessageMiddleware,
    directMessageCallback,
  );
  app.message(onlyChannelType("channel"), urlSharedMiddleware);
  app.message(onlyChannelType("mpim"), urlSharedMiddleware);
  app.message(onlyChannelType("group"), urlSharedMiddleware);
};

export default { register };
