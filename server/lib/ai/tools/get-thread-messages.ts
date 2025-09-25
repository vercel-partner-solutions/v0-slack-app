import { generateText, tool } from "ai";
import { z } from "zod";
import { app } from "~/app";
import { getThreadContextAsModelMessage } from "~/lib/slack/utils";
import type { ExperimentalContext } from "../respond-to-message";

export const getThreadMessagesTool = tool({
  name: "get_thread_messages",
  description:
    "Get the messages from a Slack thread. This will help you understand the context of the thread conversation.",
  inputSchema: z.object({}),
  execute: async (_, { experimental_context }) => {
    try {
      const { channel, thread_ts, botId } =
        experimental_context as ExperimentalContext;

      const messages = await getThreadContextAsModelMessage({
        channel,
        ts: thread_ts,
        botId,
      });

      const messageThreadSummary = await generateText({
        model: "openai/gpt-4o-mini",
        messages,
        system: "Summarize the thread messages in a concise way.",
      });

      return messageThreadSummary;
    } catch (error) {
      app.logger.error("Failed to get thread messages:", error);
    }
  },
});
