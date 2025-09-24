import { app } from "~/app";

export const redis = useStorage("redis");

export const getExistingChat = async (
  thread_ts: string,
): Promise<string | undefined> => {
  const chatKey = `chat:${thread_ts}`;
  try {
    const existingChatId = await redis.get(chatKey);

    if (typeof existingChatId !== "string") {
      throw new Error("Existing chat ID is not a string");
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

export const setExistingChat = async (
  thread_ts: string,
  chatId: string,
): Promise<void> => {
  const chatKey = `chat:${thread_ts}`;
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
