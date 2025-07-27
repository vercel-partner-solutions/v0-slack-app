import pkg from "@slack/bolt";
const { App, LogLevel } = pkg;
import { VercelReceiver } from "@vercel/bolt";
import registerListeners from "./listeners";

const receiver = new VercelReceiver({
  logLevel: LogLevel.INFO,
  signatureVerification: false,
});

/** Initialization */
const app = new App({
  token: process.env.SLACK_BOT_TOKEN,
  signingSecret: process.env.SLACK_SIGNING_SECRET,
  logLevel: LogLevel.INFO,
  receiver,
  deferInitialization: true,
  signatureVerification: false,
});

registerListeners(app);

export { app, receiver };
