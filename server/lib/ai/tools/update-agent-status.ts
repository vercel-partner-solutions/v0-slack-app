import { tool } from "ai";
import { z } from "zod";
import { app } from "~/app";
import type { ExperimentalContext } from "../respond-to-message";

export const updateAgentStatusTool = tool({
  name: "update_agent_status",
  description: "Update the status of the agent",
  inputSchema: z.object({
    status: z
      .string()
      .describe(
        `The status of the agent. This should be a very short description of what the agent is doing. Example: 'is reading thread...', 
        'is reading channel...', 'is thinking...', 'is responding...'`,
      )
      .min(15)
      .max(30),
  }),
  execute: ({ status }, { experimental_context }) => {
    try {
      const { channel, thread_ts } =
        experimental_context as ExperimentalContext;

      if (!channel || !thread_ts) {
        app.logger.warn(
          "update_agent_status skipped: missing channel/thread_ts",
        );
        return;
      }

      app.client.assistant.threads.setStatus({
        channel_id: channel,
        thread_ts,
        status,
      });
    } catch (error) {
      app.logger.error("Failed to update agent status:", error);
    }
  },
});
