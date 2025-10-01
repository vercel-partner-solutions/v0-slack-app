import pkg, { LogLevel } from "@slack/bolt";

const { App } = pkg;

import { VercelReceiver } from "@vercel/slack-bolt";
import { authMiddleware } from "~/lib/auth/middleware";
import registerListeners from "~/listeners";

const logLevel =
  process.env.NODE_ENV === "development" ? LogLevel.DEBUG : LogLevel.INFO;

const receiver = new VercelReceiver({
  logLevel: LogLevel.ERROR,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
  deferInitialization: true,
  logLevel: LogLevel.INFO,
});

// Add global auth middleware
app.use(authMiddleware);

registerListeners(app);

export { app, receiver };
