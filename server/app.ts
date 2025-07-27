import pkg from "@slack/bolt";

const { App } = pkg;

import { VercelReceiver } from "@vercel/bolt";
import registerListeners from "./listeners";

const receiver = new VercelReceiver();

/** Initialization */
const app = new App({
	token: process.env.SLACK_BOT_TOKEN,
	signingSecret: process.env.SLACK_SIGNING_SECRET,
	receiver,
	deferInitialization: true,
});

registerListeners(app);

export { app, receiver };
