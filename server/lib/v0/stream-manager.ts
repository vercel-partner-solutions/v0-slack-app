import type {
  MessageBinaryFormat,
  StreamingMessageState,
  UseStreamingMessageOptions,
} from "@v0-sdk/react";
import type { Delta } from "jsondiffpatch";
import * as jsondiffpatch from "jsondiffpatch";
import { app } from "~/app";

const jdf = jsondiffpatch.create({});

function patch(original: unknown, delta: unknown) {
  const newObj = jdf.clone(original);

  if (Array.isArray(delta) && delta[1] === 9 && delta[2] === 9) {
    const indexes = delta[0].slice(0, -1);
    const value = delta[0].slice(-1);
    let obj = newObj as Record<string, unknown>;
    for (const index of indexes) {
      if (typeof obj[index] === "string") {
        obj[index] += value;
        return newObj;
      }
      obj = obj[index] as Record<string, unknown>;
    }
  }

  jdf.patch(newObj, delta as Delta);
  return newObj;
}

export class StreamStateManager {
  private content: MessageBinaryFormat = [];
  private isStreaming: boolean = false;
  private error?: string;
  private isComplete: boolean = false;
  private callbacks = new Set<() => void>();
  private processedStreams = new WeakSet<ReadableStream<Uint8Array>>();
  private cachedState: StreamingMessageState | null = null;

  subscribe = (callback: () => void) => {
    this.callbacks.add(callback);
    return () => {
      this.callbacks.delete(callback);
    };
  };

  private notifySubscribers = () => {
    this.cachedState = null;
    this.callbacks.forEach((callback) => {
      callback();
    });
  };

  getState = (): StreamingMessageState => {
    if (this.cachedState === null) {
      this.cachedState = {
        content: this.content,
        isStreaming: this.isStreaming,
        error: this.error,
        isComplete: this.isComplete,
      };
    }
    return this.cachedState;
  };

  processStream = async (
    stream: ReadableStream<Uint8Array>,
    options: UseStreamingMessageOptions = {},
  ): Promise<void> => {
    if (this.processedStreams.has(stream)) {
      return;
    }

    if (stream.locked) {
      app.logger.warn("Stream is locked, cannot process");
      return;
    }

    this.processedStreams.add(stream);
    this.reset();
    this.setStreaming(true);

    try {
      await this.readStream(stream, options);
    } catch (err) {
      const errorMessage =
        err instanceof Error ? err.message : "Unknown streaming error";
      this.setError(errorMessage);
      options.onError?.(errorMessage);
    } finally {
      this.setStreaming(false);
    }
  };

  private reset = () => {
    this.content = [];
    this.isStreaming = false;
    this.error = undefined;
    this.isComplete = false;
    this.notifySubscribers();
  };

  private setStreaming = (streaming: boolean) => {
    this.isStreaming = streaming;
    this.notifySubscribers();
  };

  private setError = (error: string) => {
    this.error = error;
    this.notifySubscribers();
  };

  private setComplete = (complete: boolean) => {
    this.isComplete = complete;
    this.notifySubscribers();
  };

  private updateContent = (newContent: MessageBinaryFormat) => {
    this.content = [...newContent];
    this.notifySubscribers();
  };

  private readStream = async (
    stream: ReadableStream<Uint8Array>,
    options: UseStreamingMessageOptions,
  ): Promise<void> => {
    app.logger.debug("🔵 StreamManager: Starting to read stream");
    const reader = stream.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let currentContent: MessageBinaryFormat = [];
    let chunkCount = 0;
    let lineCount = 0;

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          app.logger.debug("🔵 StreamManager: Stream done");
          break;
        }

        chunkCount++;
        app.logger.debug(
          `🔵 StreamManager: Raw chunk #${chunkCount}, size: ${value.length} bytes`,
        );

        const chunk = decoder.decode(value, { stream: true });
        buffer += chunk;
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          if (line.trim() === "") {
            continue;
          }

          lineCount++;
          app.logger.debug(
            `🔵 StreamManager: Processing line #${lineCount}: ${line.substring(0, 100)}...`,
          );

          let jsonData: string;
          if (line.startsWith("data: ")) {
            jsonData = line.slice(6);
            if (jsonData === "[DONE]") {
              app.logger.debug("🔵 StreamManager: Received [DONE] signal");
              this.setComplete(true);
              options.onComplete?.(currentContent);
              return;
            }
          } else {
            jsonData = line;
          }

          try {
            const parsedData = JSON.parse(jsonData);
            app.logger.debug(
              `🔵 StreamManager: Parsed data type: ${parsedData.type || "no type"}, object: ${parsedData.object || "no object"}`,
            );

            if (parsedData.type === "connected") {
              app.logger.debug("🔵 StreamManager: Connected message");
              continue;
            } else if (parsedData.type === "done") {
              app.logger.debug("🔵 StreamManager: Done message");
              this.setComplete(true);
              options.onComplete?.(currentContent);
              return;
            } else if (parsedData.object?.startsWith("chat")) {
              app.logger.debug(
                `🔵 StreamManager: Chat metadata - ${parsedData.object}`,
              );
              options.onChatData?.(parsedData);
              continue;
            } else if (parsedData.delta) {
              app.logger.debug("🔵 StreamManager: Applying delta patch");
              const patchedContent = patch(currentContent, parsedData.delta);
              currentContent = Array.isArray(patchedContent)
                ? (patchedContent as MessageBinaryFormat)
                : [];

              this.updateContent(currentContent);
              options.onChunk?.(currentContent);
              app.logger.debug(
                `🔵 StreamManager: Content updated, length: ${JSON.stringify(currentContent).length}`,
              );
            }
          } catch (e) {
            app.logger.warn("Failed to parse streaming data:", line, e);
          }
        }
      }

      app.logger.debug("🔵 StreamManager: Stream loop ended, setting complete");
      this.setComplete(true);
      options.onComplete?.(currentContent);
    } finally {
      app.logger.debug("🔵 StreamManager: Releasing reader lock");
      reader.releaseLock();
    }
  };
}
