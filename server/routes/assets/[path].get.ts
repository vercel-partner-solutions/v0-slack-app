export default defineEventHandler(async (event) => {
  const encoded = getRouterParam(event, "path");

  if (!encoded) {
    throw createError({ statusCode: 400, message: "Missing file path" });
  }

  // Decode base64url to get original Slack URL
  const slackUrl = Buffer.from(encoded, "base64url").toString("utf-8");

  // Proxy to Slack with bot token
  return sendProxy(event, slackUrl, {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
  });
});
