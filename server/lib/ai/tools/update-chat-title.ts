import { tool } from "ai";
import { z } from "zod";
import { app } from "~/app";
import type { ExperimentalContext } from "../respond-to-message";

export const updateChatTitleTool = tool({
  name: "update_chat_title",
  description: "Update the title of the chat",
  inputSchema: z.object({
    title: z.string().describe("The new title of the chat"),
  }),
  execute: ({ title }, { experimental_context }) => {
    try {
      const { channel, thread_ts } =
        experimental_context as ExperimentalContext;

      if (!channel || !thread_ts) {
        app.logger.warn("update_chat_title skipped: missing channel/thread_ts");
        return;
      }

      app.client.assistant.threads.setTitle({
        channel_id: channel,
        thread_ts,
        title,
      });
    } catch (error) {
      app.logger.error("Failed to update chat title:", error);
    }
  },
});
