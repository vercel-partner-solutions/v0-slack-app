import type { App } from "@slack/bolt";
import { onlyChannelType } from "~/lib/slack/utils";
import { directMessageCallback } from "./direct-message";
import { directMessageMiddleware } from "./middleware";

const register = (app: App) => {
  app.message(
    onlyChannelType("im"),
    directMessageMiddleware,
    directMessageCallback,
  );
};

export default { register };
