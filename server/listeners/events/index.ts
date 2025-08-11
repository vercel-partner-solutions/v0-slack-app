import type { App } from "@slack/bolt";
import appHomeOpenedCallback from "./app-home-opened";
import appMentionCallback from "./app-mention";
import { assistantThreadStartedCallback } from "./assistant-thread-started";

const register = (app: App) => {
  app.event("app_home_opened", appHomeOpenedCallback);
  app.event("app_mention", appMentionCallback);
  app.event("assistant_thread_started", assistantThreadStartedCallback);
};

export default { register };
