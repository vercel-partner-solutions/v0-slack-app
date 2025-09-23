import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/web-api";
import { generateText } from "ai";
import { type ChatDetail, v0 } from "v0-sdk";
import { cleanV0Stream } from "~/lib/ai/utils";
import { updateAgentStatus } from "~/lib/slack/utils";

/**
 * Handles direct message events in Slack threads
 */
export const directMessageCallback = async ({
  say,
  logger,
  event,
  client,
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & { event: GenericMessageEvent }) => {
  const { channel, thread_ts, text } = event;

  if (!text) {
    return;
  }

  updateAgentStatus({
    channel,
    thread_ts,
    status: "is typing...",
  });

  try {
    const redis = useStorage("redis");
    const chatKey = `chat:${thread_ts}`;
    const existingChatId = (await redis.get(chatKey)) as string | null;

    let demoUrl = null;
    let v0Chat: ChatDetail;

    if (existingChatId) {
      v0Chat = (await v0.chats.sendMessage({
        chatId: existingChatId,
        message: text,
        responseMode: "sync",
      })) as ChatDetail;
    } else {
      const { text: title } = await generateText({
        model: "openai/gpt-4o-mini",
        system: `
        Take these messages and generate a title that will be given to v0, a generative UI tool. The title should be concise and relevant to the conversation.
        The title should be no more than 29 characters.
        `,
        messages: [{ role: "user", content: text }],
      });

      const titleWithPrefix = `🤖 ${title}`;

      const projectId = await v0.projects.create({
        name: titleWithPrefix,
        instructions:
          "Do not use integrations in this project. Always skip the integrations step.",
      });
      await client.assistant.threads.setTitle({
        channel_id: channel,
        thread_ts,
        title: titleWithPrefix,
      });
      v0Chat = (await v0.chats.create({
        message: text,
        projectId: projectId.id,
        responseMode: "sync",
      })) as ChatDetail;

      await redis.set(chatKey, v0Chat.id);
    }


    let summary = cleanV0Stream(v0Chat.text);
    demoUrl = v0Chat.latestVersion?.demoUrl;

    if (demoUrl) {
      summary += `\n\n<${demoUrl}|View demo>`;
    }

    await say({
      blocks: [
        {
          type: "markdown",
          text: summary,
        },
      ],
      text: summary,
      thread_ts,
    });
  } catch (error) {
    logger.error("Direct message handler failed:", error);

    await say({
      text: "Sorry, something went wrong processing your message. Please try again.",
      thread_ts,
    });
  }
};
