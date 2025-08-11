import type { App } from "@slack/bolt";
import { onlyChannelType } from "~/lib/slack/utils";
import directMessageCallback from "./direct-message";
import groupMessageCallback from "./group-message";
import mpimMessageCallback from "./mpim-message";

const register = (app: App) => {
  app.message(onlyChannelType("im"), directMessageCallback);
  app.message(onlyChannelType("group"), groupMessageCallback);
  app.message(onlyChannelType("mpim"), mpimMessageCallback);
  // We handle channel messages in the app_mention event listener to keep noise down
  // app.message(onlyChannelType("channel"), channelMessageCallback);
};

export default { register };
