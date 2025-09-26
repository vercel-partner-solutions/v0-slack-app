import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import type {
  ConversationsHistoryArguments,
  ConversationsRepliesArguments,
} from "@slack/web-api";
import type { MessageElement } from "@slack/web-api/dist/types/response/ConversationsHistoryResponse";
import type { ModelMessage } from "ai";
import { app } from "~/app";

/**
 * Helper function to create a middleware that only runs a callback if the message
 * is in a specific Slack channel type.
 *
 * @example
 * app.message(onlyChannelType("im"), directMessageCallback);
 *
 * @param {SlackEventMiddlewareArgs<"message">["event"]["channel_type"]} type - The Slack channel type to filter for ("im", "group", "mpim", "channel").
 * @returns {Function} Middleware function that only calls next() if the event's channel_type matches the specified type.
 */
export const onlyChannelType =
  (type: SlackEventMiddlewareArgs<"message">["event"]["channel_type"]) =>
  /**
   * Middleware that proceeds only when the incoming message is in the specified channel type.
   *
   * Channel types include: "im" (DM), "group" (private channel), "mpim" (multi-person DM), and "channel" (public channel).
   *
   * @param {SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs} args - Handler args containing the Slack event and next callback.
   * @returns {Promise<void>} Resolves after conditionally calling `next()`.
   */
  async ({
    event,
    next,
  }: SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs) => {
    if (event.channel_type === type) {
      await next();
    }
  };

export const updateAgentStatus = async ({
  channel,
  thread_ts,
  status,
}: {
  channel: string;
  thread_ts: string;
  status: string;
}) => {
  try {
    await app.client.assistant.threads.setStatus({
      channel_id: channel,
      thread_ts,
      status,
    });
  } catch (error) {
    app.logger.error("Failed to update agent status", {
      channel,
      thread_ts,
      status,
      error,
    });
  }
};

// Extend the ModelMessage type with Slack-specific metadata to identify multiple users in the same thread
export type SlackUIMessage<TMetadata = Record<string, unknown>> =
  ModelMessage & {
    subtype?: string;
    metadata?: MessageElement & {
      event_type?: string;
      event_payload?: {
        chat_id?: string;
      } & TMetadata;
    } & TMetadata;
  };

const getThreadMessages = async (
  args: ConversationsRepliesArguments,
): Promise<MessageElement[]> => {
  const thread = await app.client.conversations.replies(args);

  return thread.messages;
};

export const getThreadMessagesAsModelMessages = async (
  args: ConversationsRepliesArguments & { botId: string },
): Promise<SlackUIMessage[]> => {
  const { botId } = args;
  const messages = await getThreadMessages(args);

  return messages.map((message) => {
    const { bot_id, text, user, ts, thread_ts, type, subtype, metadata } =
      message;
    return {
      role: bot_id === botId ? "assistant" : "user",
      content: text,
      subtype,
      metadata: {
        user: user || null,
        bot_id: bot_id || null,
        ts,
        thread_ts,
        type,
        ...metadata,
      },
    };
  });
};

const getChannelContext = async (args: ConversationsHistoryArguments) => {
  const history = await app.client.conversations.history(args);
  return history.messages || [];
};

export const getChannelContextAsModelMessage = async (
  args: ConversationsHistoryArguments & { botId: string },
): Promise<SlackUIMessage[]> => {
  const { botId } = args;
  const messages = await getChannelContext(args);

  return messages.map((message) => {
    const { bot_id, text, user, ts, thread_ts, type } = message;
    return {
      role: bot_id === botId ? "assistant" : "user",
      content: text,
      metadata: {
        user: user || null,
        bot_id: bot_id || null,
        ts,
        thread_ts,
        type,
      },
    };
  });
};

export const addReaction = async ({
  channel,
  timestamp,
  name,
}: {
  channel: string;
  timestamp: string;
  name: string;
}) => {
  try {
    await app.client.reactions.add({
      channel,
      timestamp,
      name,
    });
  } catch (error) {
    app.logger.warn(`Failed to add reaction ${name}:`, error);
  }
};

export const removeReaction = async ({
  channel,
  timestamp,
  name,
}: {
  channel: string;
  timestamp: string;
  name: string;
}) => {
  try {
    await app.client.reactions.remove({
      channel,
      timestamp,
      name,
    });
  } catch (error) {
    app.logger.warn(`Failed to remove reaction ${name}:`, error);
  }
};

/**
 * Higher-level API for managing message processing state reactions
 */
export const MessageState = {
  /**
   * Mark a message as being processed by adding an hourglass reaction
   */
  setProcessing: async ({
    channel,
    timestamp,
  }: {
    channel: string;
    timestamp: string;
  }) => {
    await addReaction({
      channel,
      timestamp,
      name: "loading",
    });
  },

  /**
   * Mark a message as successfully processed by replacing hourglass with checkmark
   */
  setCompleted: async ({
    channel,
    timestamp,
  }: {
    channel: string;
    timestamp: string;
  }) => {
    await removeReaction({
      channel,
      timestamp,
      name: "loading",
    });
    await addReaction({
      channel,
      timestamp,
      name: "white_check_mark",
    });
  },

  /**
   * Mark a message as failed by replacing hourglass with error mark
   */
  setError: async ({
    channel,
    timestamp,
  }: {
    channel: string;
    timestamp: string;
  }) => {
    await removeReaction({
      channel,
      timestamp,
      name: "loading",
    });
    await addReaction({
      channel,
      timestamp,
      name: "x",
    });
  },
};

export const isV0ChatUrl = (url: URL | string): boolean => {
  // Convert URL object to string
  const urlString = url instanceof URL ? url.toString() : url;

  // Validate that this is a v0.app chat URL - allows additional paths and query params
  // biome-ignore lint/complexity/noUselessEscapeInRegex: <I think it's wrong>
  const v0ChatUrlRegex = /^https:\/\/v0\.app\/chat\/[^\/]+-[a-zA-Z0-9]+/;
  return v0ChatUrlRegex.test(urlString);
};

export const tryGetChatIdFromV0Url = (
  url: URL | string,
): string | undefined => {
  // Convert URL object to string
  const urlString = url instanceof URL ? url.toString() : url;

  // First validate the URL format
  if (!isV0ChatUrl(urlString)) {
    return undefined;
  }

  // Extract the chat ID using a more specific regex - allows additional paths and query params
  const v0ChatIdRegex = /^https:\/\/v0\.app\/chat\/[^/]+-([a-zA-Z0-9]+)/;
  const match = urlString.match(v0ChatIdRegex);

  return match?.[1];
};
