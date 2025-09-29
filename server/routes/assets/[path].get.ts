import {
  defineEventHandler,
  getRequestHost,
  getRequestIP,
  sendProxy,
} from "h3";
import { app } from "~/app";
import { validateSignedUrl } from "~/lib/assets/utils";

export default defineEventHandler(async (event) => {
  const encodedUrl = getRouterParam(event, "path");

  if (!encodedUrl) {
    throw createError({
      statusCode: 400,
      statusMessage: "Asset URL is required",
    });
  }

  try {
    // Decode the URL that was passed as the path parameter
    const fileUrl = decodeURIComponent(encodedUrl);

    // Validate that this is a Slack file URL
    if (!fileUrl.match(/^https:\/\/(files\.)?slack\.com\//)) {
      throw createError({
        statusCode: 400,
        statusMessage: "Invalid Slack file URL",
      });
    }

    // Extract query parameters for signature validation
    const query = getQuery(event);
    const signature = query.sig as string;
    const expiresAt = query.exp as string;
    const chatId = query.chat as string;

    // Validate the signed URL
    const validation = validateSignedUrl(fileUrl, signature, expiresAt, chatId);

    if (!validation.isValid) {
      app.logger.warn(`Invalid asset request: ${validation.error}`, {
        fileUrl,
        clientIp: getRequestIP(event),
        userAgent: getRequestHeader(event, "user-agent"),
        host: getRequestHost(event),
      });

      throw createError({
        statusCode: 403,
        statusMessage: validation.error || "Access denied",
      });
    }

    // Use sendProxy for reliable streaming with authentication
    return sendProxy(event, fileUrl, {
      headers: {
        Authorization: `Bearer ${process.env.SLACK_BOT_TOKEN}`,
      },
      sendStream: true,
      streamRequest: true,
    });
  } catch (error) {
    app.logger.error("Error fetching Slack asset:", error);

    if (error.statusCode) {
      throw error;
    }

    throw createError({
      statusCode: 500,
      statusMessage: "Failed to fetch asset from Slack",
    });
  }
});
