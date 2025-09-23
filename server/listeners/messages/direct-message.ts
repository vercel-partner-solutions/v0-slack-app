import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type { GenericMessageEvent } from "@slack/web-api";
import { generateText } from "ai";
import { type ChatDetail, v0 } from "v0-sdk";
import { extractV0Summary } from "~/lib/ai/utils";
import { updateAgentStatus } from "~/lib/slack/utils";

/**
 * Handles direct message events in Slack threads
 */
export const directMessageCallback = async ({
  say,
  logger,
  event,
}: AllMiddlewareArgs &
  SlackEventMiddlewareArgs<"message"> & { event: GenericMessageEvent }) => {
  const { channel, thread_ts, text } = event;

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
      const projectTitle = await generateText({
        model: "openai/gpt-4o-mini",
        system: `
        Take these messages and generate a title for the v0 project.
        `,
        messages: [{ role: "user", content: text }],
      });
      const projectId = await v0.projects.create({
        name: `🤖 ${projectTitle.text}`,
      });
      v0Chat = (await v0.chats.create({
        message: text,
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
  } catch (error) {
    logger.error("Direct message handler failed:", error);

    await say({
      text: "Sorry, something went wrong processing your message. Please try again.",
      thread_ts,
    });
  }
};
