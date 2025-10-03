import { createHandler } from "@vercel/slack-bolt";
import { app, receiver } from "~/app";

let initialized = false;

const handler = createHandler(app, receiver);

export default defineEventHandler(async (event) => {
  app.logger.info("🌐 Slack event endpoint hit!");
  app.logger.info(`Method: ${event.method}, Path: ${event.path}`);

  if (!initialized) {
    app.logger.info("🔧 Initializing Slack app...");
    await app.init();
    initialized = true;
    app.logger.info("✅ Slack app initialized!");
  }

  const request = toWebRequest(event);
  const response = await handler(request);

  app.logger.info(`Response status: ${response.status}`);
  return response;
});
