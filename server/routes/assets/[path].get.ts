export default defineEventHandler(async (event) => {
  const encoded = getRouterParam(event, "path");
  const { key } = getQuery(event);

  if (!encoded) {
    throw createError({ statusCode: 400, message: "Missing file path" });
  }
  
  // Verify the secret key
  if (key !== process.env.ASSET_SIGNING_SECRET) {
    throw createError({ statusCode: 403, message: "Forbidden" });
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
