import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { generateText } from "ai";
import { v0 } from "v0-sdk";
import { app } from "~/app";
import { proxySlackUrl } from "~/lib/assets/utils";
import { getChatIDFromThread, setExistingChat } from "~/lib/redis";
import { createActionBlocks, SignInBlock } from "~/lib/slack/ui/blocks";
import {
  getMessagesFromEvent,
  isV0ChatUrl,
  type SlackUIMessage,
  stripSlackUserTags,
  tryGetChatIdFromV0Url,
  updateAgentStatus,
} from "~/lib/slack/utils";
import { handleV0StreamToSlack } from "~/lib/v0/streaming-handler";
import {
  type ChatDetail,
  chatsCreate,
  chatsSendMessage,
} from "~/lib/v0/client";
import { cleanV0Stream } from "~/lib/v0/utils";
import {
  DEFAULT_ERROR_MESSAGE,
  SYSTEM_PROMPT,
} from "../messages/direct-message";

export const appMentionCallback = async ({
  event,
  context,
  say,
  client,
  logger,
  body,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  const { channel, thread_ts, ts } = event;
  const { userId, teamId, session } = context;
  const appId = body.api_app_id;

  logger.debug("📢 App mention received");
  logger.debug(`Channel: ${channel}, Thread: ${thread_ts}, TS: ${ts}`);

  try {
    if (!session) {
      await say({
        channel,
        blocks: [SignInBlock({ user: userId, teamId, appId })],
        text: `Hi, <@${userId}>. Please sign in to continue.`,
        thread_ts: thread_ts || ts,
      });
      return;
    }

    await updateAgentStatus({
      channel,
      thread_ts: thread_ts || ts,
      status: "is thinking...",
    });

    logger.debug("📨 Getting messages from event...");
    const messages = await getMessagesFromEvent(event);
    logger.debug(`Got ${messages.length} messages`);

    logger.debug("🔄 Creating prompt and resolving chat ID...");
    const [prompt, attachments, chatId] = await Promise.all([
      createPromptFromMessages(messages),
      createAttachmentsArray(messages),
      resolveChatId(messages, thread_ts),
    ]);
    logger.debug(`Prompt: ${prompt.substring(0, 100)}...`);
    logger.debug(
      `Attachments: ${attachments.length}, Chat ID: ${chatId || "none"}`,
    );

    const cleanPrompt = stripSlackUserTags(prompt);
    let stream: ReadableStream<Uint8Array>;

    if (chatId) {
      logger.debug(`🔄 Sending to existing chat: ${chatId}`);
      await setExistingChat(thread_ts, chatId);
      const response = await v0.chats.sendMessage({
        chatId,
        message: cleanPrompt,
        responseMode: "experimental_stream",
        attachments: attachments,
      });

      if (!(response instanceof ReadableStream)) {
        throw new Error("Expected stream response");
      }
      logger.debug("✅ Got stream from v0.chats.sendMessage");
      stream = response;
    } else {
      logger.debug("🆕 Creating new chat");
      const response = await v0.chats.create({
        message: cleanPrompt,
        responseMode: "experimental_stream",
        attachments: attachments,
        system: SYSTEM_PROMPT,
      });

      if (!(response instanceof ReadableStream)) {
        throw new Error("Expected stream response");
      }
      logger.debug("✅ Got stream from v0.chats.create");
      stream = response;
    }

    logger.debug("🚀 Calling handleV0StreamToSlack...");
    await handleV0StreamToSlack({
      client,
      logger,
      channel,
      thread_ts: thread_ts || ts,
      v0Stream: stream,
      onComplete: async (completedChatId) => {
        logger.debug(`✅ Stream complete, chat ID: ${completedChatId}`);
        if (completedChatId) {
          logger.debug(`💾 Saving chat ID: ${completedChatId}`);
          await setExistingChat(thread_ts || ts, completedChatId);
        }
      },
    });
    logger.debug("✅ handleV0StreamToSlack finished");
  } catch (error) {
    logger.error("❌ app_mention handler failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;

    await say({
      text: errorMessage,
      thread_ts: thread_ts || ts,
    });
  } finally {
    if (thread_ts) {
      await updateAgentStatus({
        channel,
        thread_ts,
        status: "",
      }).catch((error) => logger.warn("Failed to clear agent status:", error));
    }
  }
};

const getMessagesSinceLastAssistantMessage = (
  messages: SlackUIMessage[],
): SlackUIMessage[] => {
  let lastAssistantIndex = -1;
  messages.forEach((message, index) => {
    if (message.role === "assistant") {
      lastAssistantIndex = index;
    }
  });
  return messages.slice(lastAssistantIndex + 1);
};

const createPromptFromMessages = async (messages: SlackUIMessage[]) => {
  if (messages.length === 1) {
    const message = messages[0];
    app.logger.info(
      "Skipping prompt generation for single message: ",
      message.content,
    );
    return message.content as string;
  }

  const relevantMessages = getMessagesSinceLastAssistantMessage(messages);
  app.logger.info("Relevant messages: ", relevantMessages);

  if (relevantMessages.length === 1) {
    const message = relevantMessages[0];
    app.logger.info(
      "Skipping prompt generation for single message: ",
      message.content,
    );
    return message.content as string;
  }

  // If no relevant messages after assistant, return the last message content
  if (relevantMessages.length === 0) {
    throw new Error(`No relevant messages found in thread`);
  }

  app.logger.info("Creating prompt from messages", {
    totalMessages: messages.length,
    relevantMessages: relevantMessages.length,
    messages: relevantMessages,
  });

  const { text: prompt } = await generateText({
    model: "gpt-4.1-nano",
    messages: relevantMessages,
    system: `You are a Prompt Engineering Expert specializing in improving user prompts to "v0", a Next.js and web development code assistant.

    If the prompt is asking for a significant build, create a PRD document.
    Keep it to a few paragraphs.

    TASK:
    When given a thread of messages, analyze and enhance it to create a more effective version while maintaining its core purpose. 
    The requests are being made to "v0", Vercel's AI assistant that specializes in writing code. The messages are in order
    from oldest to newest. Newer decisions are more important than older decisions. If the messages are asking a question, don't
    answer the question, just enhance the prompt.

    ANALYSIS PROCESS:

    1. Evaluate the original prompt:

    - Identify the main objective
    - Note any ambiguities or gaps
    - Assess the clarity of instructions
    - Check for missing context

    2. Apply these prompt engineering principles:

    - Write clear, specific instructions
    - Include necessary context
    - Set explicit parameters and constraints
    - Structure the output format
    - Add relevant examples
    - Match tone and complexity to the use case
    - Remove redundant information

    3. Create the enhanced version:

    - Maintain the original goal
    - Incorporate identified improvements
    - Ensure clarity and completeness
    - Be realistic in the features to add. Multiplayer or advanced 3D graphics aren't reasonable.
    - Do NOT request a guide, how-to, instructions, etc. unless the user asked for it.
    - Do NOT ask for code snippets, v0 will handle that.
    - Do NOT suggest specific technologies unless the user mentioned them.
    - Do NOT say HOW to do anything, focus on the WHAT.
    - Do NOT answer questions. Instead, expand upon them and rephrase / rewrite them to be longer and more intricate.

    FORMAT:
    Provide only the enhanced prompt with no additional commentary or explanations.

    Example input: "A website for my dog"
    Example output: "Design a personalized Next.js website dedicated to showcasing my dog. Include sections such as a photo gallery, a biography detailing the dog's breed, age, and personality traits, and a blog for sharing stories or updates about your dog's adventures. Add a contact form for visitors to reach out with questions or comments. Ensure the website is visually appealing and easy to navigate, with a responsive design that works well on both desktop and mobile devices."

    Example input: "Convert this to Vercel's tone of voice, maintain the technical details but reduce bullets in favor of narrative. Ensure
    it's not marketing jargony at all (e.g. remove "enter vercel router")

    Use canvas"

    Example output: "Transform the provided content into a narrative format that aligns with Vercel's tone of voice. Ensure the technical details are preserved while minimizing the use of bullet points. Avoid any marketing jargon, such as phrases like 'enter Vercel router.' Incorporate the concept of using a canvas in the narrative to enhance the explanation."
`,
  });

  return prompt;
};

const getChatIdFromMessages = (messages: SlackUIMessage[]) => {
  let chatId: string | undefined;
  for (const message of messages) {
    if (typeof message.content === "string") {
      const urlRegex = /https?:\/\/[^\s]+/g;
      const urls = message.content.match(urlRegex) || [];

      for (const url of urls) {
        if (isV0ChatUrl(url)) {
          const chatIdFromUrl = tryGetChatIdFromV0Url(url);
          if (chatIdFromUrl) {
            chatId = chatIdFromUrl;
          }
        }
      }
    }
  }
  return chatId;
};

const resolveChatId = async (
  messages: SlackUIMessage[],
  thread_ts?: string,
): Promise<string | undefined> => {
  // First priority: chat ID from v0 URLs in messages
  const chatIdFromMessages = getChatIdFromMessages(messages);
  if (chatIdFromMessages) {
    return chatIdFromMessages;
  }

  return await getChatIDFromThread(thread_ts);
};

const createAttachmentsArray = (
  messages: SlackUIMessage[],
): { url: string }[] => {
  const files = messages.flatMap((message) => message.metadata?.files);

  const attachments = [];
  for (const file of files) {
    if (file?.url_private) {
      const proxyUrl = proxySlackUrl(file.url_private);
      attachments.push({
        url: proxyUrl,
      });
    }
  }
  return attachments;
};
