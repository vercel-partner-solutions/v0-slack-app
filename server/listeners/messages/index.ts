import type { App } from "@slack/bolt";
import { onlyChannelType } from "~/lib/slack/utils";
import { directMessageCallback } from "./direct-message";

const register = (app: App) => {
  app.message(onlyChannelType("im"), directMessageCallback);
  // We handle public channel, private channel, and group messages in the app_mention event listener to keep noise down
  // app.message(onlyChannelType("channel"), channelMessageCallback);
  // app.message(onlyChannelType("group"), groupMessageCallback);
  // app.message(onlyChannelType("mpim"), mpimMessageCallback);
};

export default { register };
