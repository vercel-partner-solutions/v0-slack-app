import { app } from "~/app";
export const redis = useStorage("redis");

// Timestamp can be thread_ts or ts
const createChatKey = (channel: string, ts: string, team: string) => {
  return `chat_${team}:${channel}:${ts}`;
};

interface RedisChatParams {
  ts: string;
  channel: string;
  team: string;
}

export const getChat = async ({ ts, channel, team }: RedisChatParams) => {
  const chatKey = createChatKey(channel, ts, team);
  try {
    const existingChatId = await redis.get<string>(chatKey);

    if (existingChatId === null || existingChatId === undefined) {
      return undefined;
    }

    return existingChatId;
  } catch (error) {
    if (error instanceof Error) {
      app.logger.error(`Failed to get existing chat with key: ${chatKey}`, {
        error: error.message,
      });
    } else {
      app.logger.error(`Failed to get existing chat with key: ${chatKey}`, {
        error,
      });
    }
    return undefined;
  }
};

interface SetChatParams extends RedisChatParams {
  chatId: string;
}

export const setChat = async ({
  ts,
  channel,
  team,
  chatId,
}: SetChatParams): Promise<void> => {
  const chatKey = createChatKey(channel, ts, team);
  try {
    await redis.set(chatKey, chatId);
  } catch (error) {
    if (error instanceof Error) {
      app.logger.error(`Failed to set existing chat with key: ${chatKey}`, {
        error: error.message,
      });
    } else {
      app.logger.error(`Failed to set existing chat with key: ${chatKey}`, {
        error,
      });
    }
  }
};

export const deleteChat = async ({
  ts,
  channel,
  team,
}: RedisChatParams): Promise<void> => {
  const chatKey = createChatKey(channel, ts, team);
  try {
    await redis.del(chatKey);
  } catch (error) {
    if (error instanceof Error) {
      app.logger.error(`Failed to delete existing chat with key: ${chatKey}`, {
        error: error.message,
      });
    } else {
      app.logger.error(`Failed to delete existing chat with key: ${chatKey}`, {
        error,
      });
    }
  }
};

export const hasChat = async ({
  ts,
  channel,
  team,
}: RedisChatParams): Promise<boolean> => {
  const chatKey = createChatKey(channel, ts, team);
  try {
    return await redis.has(chatKey);
  } catch (error) {
    if (error instanceof Error) {
      app.logger.error(`Failed to check if chat exists with key: ${chatKey}`, {
        error: error.message,
      });
    } else {
      app.logger.error(`Failed to check if chat exists with key: ${chatKey}`, {
        error,
      });
    }
  }
  return false;
};
