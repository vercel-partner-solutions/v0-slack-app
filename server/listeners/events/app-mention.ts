import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { generateObject, type ModelMessage } from "ai";
import { type ChatDetail, v0 } from "v0-sdk";
import { z } from "zod";
import { extractV0Summary } from "~/lib/ai/utils";
import {
  getThreadContextAsModelMessage,
  MessageState,
  updateAgentStatus,
} from "~/lib/slack/utils";

const appMentionCallback = async ({
  event,
  say,
  logger,
  context,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  const { channel, thread_ts, ts } = event;

  try {
    await MessageState.setProcessing({
      channel,
      timestamp: ts,
    });

    let messages: ModelMessage[] = [];

    if (thread_ts) {
      updateAgentStatus({
        channel,
        thread_ts,
        status: "is thinking...",
      });
      messages = await getThreadContextAsModelMessage({
        channel,
        ts: thread_ts,
        botId: context.botId,
      });
    } else {
      messages = [
        {
          role: "user",
          content: event.text,
        },
      ];
    }

    const { object } = await generateObject({
      model: "openai/gpt-4o-mini",
      system: `
      Take these messages and generate a prompt and title that will be given to v0, a generative UI tool.
      `,
      messages,
      schema: z.object({
        prompt: z.string().describe("The prompt for the v0 chat"),
        title: z
          .string()
          .describe("The title of the v0 project")
          .min(20)
          .max(29),
      }),
    });

    const redis = useStorage("redis");
    const chatKey = `chat:${thread_ts}`;
    const existingChatId = (await redis.get(chatKey)) as string | null;

    let demoUrl = null;
    let v0Chat: ChatDetail;

    if (existingChatId) {
      v0Chat = (await v0.chats.sendMessage({
        chatId: existingChatId,
        message: object.prompt,
        responseMode: "sync",
      })) as ChatDetail;
    } else {
      const projectId = await v0.projects.create({
        name: `🤖 ${object.title}`,
        instructions:
          "Do not use integrations in this project. Always skip the integrations step.",
      });
      v0Chat = (await v0.chats.create({
        message: object.prompt,
        projectId: projectId.id,
        responseMode: "sync",
      })) as ChatDetail;

      await redis.set(chatKey, v0Chat.id);
    }

    const lastMessage = v0Chat.messages[v0Chat.messages.length - 1];
    const summary = extractV0Summary(lastMessage.content);
    demoUrl = v0Chat.latestVersion?.demoUrl;

    await say({
      text: `${summary}\n\n${demoUrl ? `<${demoUrl}|View demo>` : ""}`,
      thread_ts,
    });

    // Set completed state
    await MessageState.setCompleted({
      channel,
      timestamp: ts,
    });
  } catch (error) {
    logger.error("app_mention handler failed:", error);

    // Try to mark message as failed, but don't let this prevent user notification
    try {
      await MessageState.setError({
        channel,
        timestamp: ts,
      });
    } catch (reactionError) {
      logger.warn("Failed to set error reaction:", reactionError);
    }

    await say({
      text: "Sorry, something went wrong processing your message. Please try again.",
      thread_ts: event.thread_ts || event.ts,
    });
  }
};

export default appMentionCallback;
