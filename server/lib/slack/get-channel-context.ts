import type { ModelMessage } from "ai";
import slack from "./client";

export const getChannelContext = async (channel_id: string) => {
  const history = await slack.conversations.history({
    channel: channel_id,
    limit: 15,
  });

  return history.messages || [];
};

export const getChannelContextAsModelMessage = async (
  channel_id: string,
  botId: string,
): Promise<ModelMessage[]> => {
  const messages = await getChannelContext(channel_id);

  return messages.map((message) => ({
    role: message.bot_id === botId ? "assistant" : "user",
    content: message.text,
  }));
};
