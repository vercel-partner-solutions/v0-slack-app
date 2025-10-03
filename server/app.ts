import pkg, { LogLevel } from "@slack/bolt";

const { App } = pkg;

import { VercelReceiver } from "@vercel/slack-bolt";
import registerListeners from "~/listeners";
import { authMiddleware } from "./lib/auth/middleware";

const receiver = new VercelReceiver({
  logLevel: LogLevel.DEBUG,
});

const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  receiver,
  deferInitialization: true,
  logLevel: LogLevel.DEBUG,
});

app.use(authMiddleware);

registerListeners(app);

export { app, receiver };
