import { generateText } from "ai";

export const respondToMessage = async (message: string) => {
  try {
    const { text } = await generateText({
      model: "xai/grok-3",
      prompt: `
      		You are a Slack bot, powered by the xai/grok-3 model.
      		You are a helpful assistant.
      		Respond to the following message from the user: ${message}
      		`,
    });

    return text;
  } catch (error) {
    console.error(error);
    return "Sorry, I encountered an error while processing your message.";
  }
};
