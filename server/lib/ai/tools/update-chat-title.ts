import { tool } from "ai";
import { z } from "zod";
import { app } from "~/app";

export const updateChatTitleTool = tool({
  name: "update_chat_title",
  description: "Update the title of the chat",
  inputSchema: z.object({
    title: z.string().describe("The new title of the chat"),
  }),
  execute: async ({ title }, { experimental_context }) => {
    const { channelId, threadTs } = experimental_context as {
      channelId: string;
      threadTs: string;
    };

    await app.client.assistant.threads.setTitle({
      channel_id: channelId,
      thread_ts: threadTs,
      title,
    });
  },
});
