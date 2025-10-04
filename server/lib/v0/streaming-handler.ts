import type { MessageBinaryFormat } from "@v0-sdk/react";
import type { Logger } from "@slack/bolt";
import { SlackStreamingClient } from "../slack/streaming";
import { StreamStateManager } from "./stream-manager";
import { renderToMarkdown } from "./render-to-markdown";

interface StreamingHandlerOptions {
  client: {
    apiCall: (
      method: string,
      options?: Record<string, unknown>,
    ) => Promise<unknown>;
  };
  logger: Logger;
  channel: string;
  thread_ts?: string;
  v0Stream: ReadableStream<Uint8Array>;
  onComplete?: (chatId?: string) => Promise<void>;
}

interface ChatMetadata {
  id?: string;
  name?: string;
  webUrl?: string;
  demoUrl?: string;
}

interface TaskTracker {
  id: string;
  type: string;
  taskNameActive?: string;
  taskNameComplete?: string;
  lastState: "pending" | "active" | "complete";
}

interface TaskInfo {
  thinking?: {
    duration: number;
  };
  tasks: TaskTracker[];
}

export async function handleV0StreamToSlack({
  client,
  logger,
  channel,
  thread_ts,
  v0Stream,
  onComplete,
}: StreamingHandlerOptions): Promise<void> {
  logger.debug("🚀 Starting v0 stream to Slack handler");
  logger.debug(`Channel: ${channel}, Thread: ${thread_ts || "none"}`);

  const slackStreaming = new SlackStreamingClient(client);
  const streamStateManager = new StreamStateManager();

  let streamTs: string | undefined;
  const chatMetadata: ChatMetadata = {};
  let batchedContent = "";
  let batchTimeout: NodeJS.Timeout | undefined;
  const BATCH_DELAY_MS = 100;
  let totalChunks = 0;
  let totalBatches = 0;
  const taskTrackers = new Map<string, TaskTracker>();
  const sentTaskLines = new Set<string>();
  let lastAssistantContent = "";
  let hasStartedTasks = false;

  const flushBatch = async () => {
    if (streamTs && batchedContent) {
      totalBatches++;
      logger.debug(
        `📤 Flushing batch #${totalBatches} (${batchedContent.length} chars)`,
      );
      try {
        await slackStreaming.appendStream({
          channel,
          ts: streamTs,
          markdown_text: batchedContent,
        });
        logger.debug(`✅ Batch #${totalBatches} sent successfully`);
        batchedContent = "";
      } catch (error) {
        logger.error(
          `❌ Failed to append stream (batch #${totalBatches}):`,
          error,
        );
      }
    }
  };

  const scheduleBatch = (content: string) => {
    logger.debug(`📦 Scheduling batch with ${content.length} new chars`);
    batchedContent += content;

    if (batchTimeout) {
      clearTimeout(batchTimeout);
    }

    batchTimeout = setTimeout(() => {
      flushBatch();
    }, BATCH_DELAY_MS);
  };

  streamStateManager.subscribe(() => {
    const state = streamStateManager.getState();
    logger.debug(
      `📨 Stream state update - streaming: ${state.isStreaming}, complete: ${state.isComplete}`,
    );

    const taskInfo = extractTaskInfo(state.content, taskTrackers);
    const assistantContent = renderToMarkdown(state.content);

    if (taskInfo.thinking && !hasStartedTasks) {
      scheduleBatch(`\n\n_Thought for ${taskInfo.thinking.duration}s_\n\n`);
      hasStartedTasks = true;
    }

    for (const task of taskInfo.tasks) {
      const taskKey = `${task.id}-${task.lastState}`;
      if (!sentTaskLines.has(taskKey)) {
        const emoji =
          task.lastState === "complete"
            ? ":todo_done:"
            : task.lastState === "active"
              ? ":loading-1273:"
              : ":todo_unchecked:";

        const taskName =
          task.lastState === "complete" && task.taskNameComplete
            ? task.taskNameComplete
            : task.taskNameActive || "Processing...";

        scheduleBatch(`\n${emoji} ${taskName}`);
        sentTaskLines.add(taskKey);
      }
    }

    if (assistantContent !== lastAssistantContent) {
      logger.debug(`🆕 Content changed`);
      const contentUpdate = assistantContent.slice(lastAssistantContent.length);
      if (contentUpdate) {
        scheduleBatch(contentUpdate);
        lastAssistantContent = assistantContent;
      }
    }
  });

  try {
    logger.debug("🎬 Calling Slack startStream...");
    const startResponse = await slackStreaming.startStream({
      channel,
      thread_ts,
      markdown_text: "",
    });

    streamTs = startResponse.ts;
    logger.debug(`✅ Stream started with ts: ${streamTs}`);
    logger.debug(`Stream response:`, startResponse);

    logger.debug("🔄 Starting to process v0 stream...");
    await streamStateManager.processStream(v0Stream, {
      onChunk: (content: MessageBinaryFormat) => {
        totalChunks++;
        logger.debug(
          `📥 Chunk #${totalChunks} received, raw length: ${JSON.stringify(content).length}`,
        );
      },
      onChatData: (data: ChatMetadata) => {
        logger.debug("📊 Chat metadata received:", data);
        if (data.id) chatMetadata.id = data.id;
        if (data.name) chatMetadata.name = data.name;
        if (data.webUrl) chatMetadata.webUrl = data.webUrl;
        if (data.demoUrl) chatMetadata.demoUrl = data.demoUrl;
      },
      onComplete: async () => {
        logger.debug("🏁 Stream complete!");
        logger.debug(
          `Total chunks: ${totalChunks}, Total batches: ${totalBatches}`,
        );

        if (batchTimeout) {
          clearTimeout(batchTimeout);
        }

        if (!streamTs) {
          logger.error("❌ No stream timestamp available");
          return;
        }

        await flushBatch();

        const actionBlocks = createCompletionBlocks(chatMetadata);

        logger.debug(`🎯 Stopping stream with ${actionBlocks.length} blocks`);

        await slackStreaming.stopStream({
          channel,
          ts: streamTs,
          blocks: actionBlocks,
        });

        logger.debug("✅ Stream stopped successfully");

        if (onComplete) {
          logger.debug("🔄 Calling onComplete callback");
          await onComplete(chatMetadata.id);
        }
      },
      onError: (error: string) => {
        logger.error("❌ Stream error:", error);
      },
    });
    logger.debug("✅ Stream processing complete");
  } catch (error) {
    logger.error("❌ Streaming handler failed:", error);

    if (streamTs) {
      try {
        logger.debug("🛑 Attempting to stop stream due to error");
        await slackStreaming.stopStream({
          channel,
          ts: streamTs,
          markdown_text: "\n\n_Error: Failed to complete streaming response_",
        });
      } catch (stopError) {
        logger.error("❌ Failed to stop stream:", stopError);
      }
    }

    throw error;
  } finally {
    if (batchTimeout) {
      clearTimeout(batchTimeout);
    }
    logger.debug("🏁 Stream handler finished");
  }
}

function extractTaskInfo(
  content: MessageBinaryFormat,
  taskTrackers: Map<string, TaskTracker>,
): TaskInfo {
  const info: TaskInfo = {
    tasks: [],
  };

  if (!Array.isArray(content)) return info;

  for (const [type, data] of content) {
    if (type === 0 && Array.isArray(data)) {
      for (const element of data) {
        if (!Array.isArray(element)) continue;

        const [tagName, props] = element;

        if (tagName === "AssistantMessageContentPart" && props?.part) {
          const part = props.part;
          const taskId = part.id || "";

          if (
            part.type === "task-thinking-v1" &&
            part.parts &&
            part.finishedAt
          ) {
            for (const thinkingPart of part.parts) {
              if (
                thinkingPart.type === "thinking-end" &&
                thinkingPart.duration
              ) {
                info.thinking = { duration: Math.round(thinkingPart.duration) };
              }
            }
          } else if (
            part.type === "task-search-repo-v1" ||
            part.type === "task-coding-v1"
          ) {
            let tracker = taskTrackers.get(taskId);
            const hasFinished = !!part.finishedAt;

            if (part.taskNameActive && !tracker) {
              tracker = {
                id: taskId,
                type: part.type,
                taskNameActive: part.taskNameActive,
                taskNameComplete: part.taskNameComplete,
                lastState: "active",
              };
              taskTrackers.set(taskId, tracker);
            }

            if (hasFinished && tracker && tracker.lastState === "active") {
              tracker.lastState = "complete";
              if (part.taskNameComplete) {
                tracker.taskNameComplete = part.taskNameComplete;
              }
            }
          }
        }
      }
    }
  }

  info.tasks = Array.from(taskTrackers.values());
  return info;
}

function createCompletionBlocks(metadata: ChatMetadata): unknown[] {
  const blocks: unknown[] = [];

  if (metadata.webUrl || metadata.demoUrl) {
    const actions: unknown[] = [];

    if (metadata.webUrl) {
      actions.push({
        type: "button",
        text: {
          type: "plain_text",
          text: "Open in v0",
          emoji: true,
        },
        url: metadata.webUrl,
        action_id: "open_in_v0_action",
      });
    }

    if (metadata.demoUrl) {
      actions.push({
        type: "button",
        text: {
          type: "plain_text",
          text: "View demo",
          emoji: true,
        },
        url: metadata.demoUrl,
        action_id: "view_demo_action",
      });
    }

    blocks.push({
      type: "actions",
      elements: actions,
    });
  }

  return blocks;
}
