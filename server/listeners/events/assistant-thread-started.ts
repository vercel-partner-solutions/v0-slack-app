import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";

export const assistantThreadStartedCallback = async ({
  event,
  logger,
  client,
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"assistant_thread_started">) => {
  const { assistant_thread } = event;

  try {
    await client.assistant.threads.setSuggestedPrompts({
      channel_id: assistant_thread.channel_id,
      thread_ts: assistant_thread.thread_ts,
      title: "Suggested Prompts",
      prompts: [
        {
          title: "Generate ideas",
          message:
            "Pretend you are a marketing associate and you need new ideas for an enterprise productivity feature. Generate 10 ideas for a new feature launch.",
        },
        {
          title: "Explain what SLACK stands for",
          message: "What does SLACK stand for?",
        },
        {
          title: "Describe how AI works",
          message: "How does artificial intelligence work?",
        },
      ],
    });
  } catch (error) {
    logger.error("Failed to get assistant thread started:", error);
  }
};
