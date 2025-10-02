export default defineEventHandler(async (event) => {
  const path = getRouterParam(event, "path");
  console.log("path", path);

  if (!path) {
    throw createError({ statusCode: 400, message: "Missing file path" });
  }

  console.log("process.env.SLACK_BOT_TOKEN", process.env.SLACK_BOT_TOKEN);
  // Proxy to Slack with bot token
  return sendProxy(event, path, {
    headers: {
      Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
    },
    onResponse: (event, response) => {
      console.log("event", event);
      console.log("response", response);
    },
  });
});
