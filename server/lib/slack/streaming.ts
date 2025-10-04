interface StreamResponse {
  ok: boolean;
  channel: string;
  ts: string;
  message?: {
    type: string;
    subtype?: string;
    text: string;
    user: string;
    ts: string;
    streaming_state?: string;
  };
}

export class SlackStreamingClient {
  constructor(
    private client: {
      apiCall: (
        method: string,
        options?: Record<string, unknown>,
      ) => Promise<unknown>;
    },
  ) {}

  async startStream({
    channel,
    thread_ts,
    markdown_text = "",
  }: {
    channel: string;
    thread_ts?: string;
    markdown_text?: string;
  }): Promise<StreamResponse> {
    const response = (await this.client.apiCall("chat.startStream", {
      channel,
      ...(thread_ts && { thread_ts }),
      ...(markdown_text && { markdown_text }),
    })) as StreamResponse;

    return response;
  }

  async appendStream({
    channel,
    ts,
    markdown_text,
  }: {
    channel: string;
    ts: string;
    markdown_text: string;
  }): Promise<StreamResponse> {
    const response = (await this.client.apiCall("chat.appendStream", {
      channel,
      ts,
      markdown_text,
    })) as StreamResponse;

    return response;
  }

  async stopStream({
    channel,
    ts,
    markdown_text,
    blocks,
  }: {
    channel: string;
    ts: string;
    markdown_text?: string;
    blocks?: unknown[];
  }): Promise<StreamResponse> {
    const response = (await this.client.apiCall("chat.stopStream", {
      channel,
      ts,
      ...(markdown_text && { markdown_text }),
      ...(blocks && { blocks: JSON.stringify(blocks) }),
    })) as StreamResponse;

    return response;
  }
}
