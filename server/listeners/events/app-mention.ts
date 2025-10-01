import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { generateText } from "ai";
import { app } from "~/app";
import { generateSignedAssetUrl } from "~/lib/assets/utils";
import { getChatIDFromThread, setExistingChat } from "~/lib/redis";
import { SignInBlock } from "~/lib/slack/ui/blocks";
import {
  getMessagesFromEvent,
  isV0ChatUrl,
  MessageState,
  type SlackUIMessage,
  stripSlackUserTags,
  tryGetChatIdFromV0Url,
  updateAgentStatus,
} from "~/lib/slack/utils";
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
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<"app_mention">) => {
  const { channel, thread_ts, ts } = event;
  const { userId, teamId, session } = context;

  try {
    if (!session) {
      await say({
        channel,
        blocks: [SignInBlock({ user: userId, teamId })],
        text: `Hi, <@${userId}>. Please sign in to continue.`,
        thread_ts: thread_ts || ts,
      });
      return;
    }

    const messages = await getMessagesFromEvent(event);

    const [prompt, attachments, chatId] = await Promise.all([
      createPromptFromMessages(messages),
      createAttachmentsArray(messages),
      resolveChatId(messages, thread_ts),
    ]);

    const cleanPrompt = stripSlackUserTags(prompt);
    let chat: ChatDetail;
    if (chatId) {
      logger.info(
        `Sending message to existing chat (${chatId}) with prompt: ${cleanPrompt}`,
      );
      const { data: chatData, error: sendMessageError } =
        await chatsSendMessage({
          path: {
            chatId,
          },
          body: {
            message: cleanPrompt,
            responseMode: "sync",
            attachments,
          },
          headers: {
            Authorization: `Bearer ${session.token}`,
            "X-Scope": session.selectedTeamId,
            "x-v0-client": "slack",
          },
        });

      if (sendMessageError) {
        throw new Error(sendMessageError.error.message, {
          cause: sendMessageError.error.type,
        });
      }

      chat = chatData;
      await setExistingChat(thread_ts, chat.id);
    } else {
      logger.info(`Creating new chat with prompt: ${cleanPrompt}`);
      const { data: chatData, error: createChatError } = await chatsCreate({
        body: {
          message: cleanPrompt,
          responseMode: "sync",
          attachments,
          system: SYSTEM_PROMPT,
          chatPrivacy: "team-edit",
        },
        headers: {
          Authorization: `Bearer ${session.token}`,
          "x-scope": session.selectedTeamId,
          "x-v0-client": "slack",
        },
      });

      if (createChatError) {
        throw new Error(createChatError.error.message, {
          cause: createChatError.error.type,
        });
      }

      // use ts here because it's a parent level message
      await setExistingChat(ts, chatData.id);
      chat = chatData;
    }

    const summary = formatChatResponse(chat);
    await say({
      blocks: [
        {
          type: "markdown",
          text: summary,
        },
      ],
      text: summary,
      channel,
      thread_ts: thread_ts || ts,
    });

    await MessageState.setCompleted({
      channel,
      timestamp: ts,
    });
  } catch (error) {
    logger.error("Direct message handler failed:", error);

    const errorMessage =
      error instanceof Error ? error.message : DEFAULT_ERROR_MESSAGE;

    await say({
      text: errorMessage,
      thread_ts: thread_ts || ts,
    });

    MessageState.setError({
      channel,
      timestamp: ts,
    }).catch((error) => logger.warn("Failed to set error reaction:", error));
  } finally {
    // clear agent status
    if (thread_ts) {
      await updateAgentStatus({
        channel,
        thread_ts,
        status: "",
      });
    }
  }
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
  app.logger.info("Creating prompt from messages", { messages });
  const { text: prompt } = await generateText({
    model: "openai/gpt-4o-mini",
    messages,
    system: `You are a Prompt Engineering Expert specializing in improving user prompts to "v0", a Next.js and web development code assistant.

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

const formatChatResponse = (v0Chat: ChatDetail): string => {
  let summary = cleanV0Stream(v0Chat.text);
  const demoUrl = v0Chat.latestVersion?.demoUrl;

  if (demoUrl) {
    summary += `\n\n<${demoUrl}|View demo>`;
  }

  return summary;
};

const createAttachmentsArray = (
  messages: SlackUIMessage[],
): { url: string }[] => {
  const files = messages.flatMap((message) => message.metadata?.files);

  const attachments = [];
  for (const file of files) {
    if (file?.url_private) {
      const signedUrl = generateSignedAssetUrl(file.url_private, {
        expiryHours: 24,
        chatId: file.id,
      });
      attachments.push({
        url: signedUrl,
      });
    }
  }
  return attachments;
};
