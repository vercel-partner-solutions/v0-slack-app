import { generateText, type ModelMessage, stepCountIs } from "ai";
import { app } from "~/app";
import { updateChatTitleTool } from "./tools";

interface RespondToMessageOptions {
  messages: ModelMessage[];
  channel?: string;
  thread_ts?: string;
}

export const respondToMessage = async ({
  messages,
  channel,
  thread_ts,
}: RespondToMessageOptions) => {
  try {
    const { text } = await generateText({
      model: "openai/gpt-5-nano",
      system: `
			You are SlackBot, a friendly and knowledgeable assistant for Slack users.
			Respond helpfully, concisely, and professionally to all questions and requests.
			Format your answers clearly, using bullet points or code blocks when appropriate.
			If you don't know the answer, say so honestly and suggest next steps if possible.

      Steps to respond:
      1. Read the conversation history and understand the user's intent.
      2. If the conversation is just starting, update the chat title to something relevant.
      2b. If the conversation switches topics, update the chat title to something relevant.
      2c. If the conversation has not switched topics, do not update the chat title.
      3. Respond to the user's message.
			`,
      messages: messages,
      stopWhen: stepCountIs(3),
      tools: {
        updateChatTitleTool,
      },
      experimental_context: {
        channelId: channel,
        threadTs: thread_ts,
      },
    });
    return text;
  } catch (error) {
    app.logger.error(error);
    return "Sorry, I encountered an error while processing your message.";
  }
};
