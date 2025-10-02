import pkg, { LogLevel } from "@slack/bolt";

const { App } = pkg;

import { VercelReceiver } from "@vercel/slack-bolt";
import registerListeners from "~/listeners";
import { authMiddleware } from "./lib/auth/middleware";

const logLevel =
  process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO;

const receiver = new VercelReceiver({
  logLevel,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
  deferInitialization: true,
  logLevel,
});

app.use(authMiddleware);

registerListeners(app);

export { app, receiver };
