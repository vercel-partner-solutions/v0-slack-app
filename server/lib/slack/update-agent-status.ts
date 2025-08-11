import { slack } from "./client";

export const updateAgentStatus = async ({
  channelId,
  threadTs,
  status,
}: {
  channelId: string;
  threadTs: string;
  status: string;
}) => {
  await slack.assistant.threads.setStatus({
    channel_id: channelId,
    thread_ts: threadTs,
    status,
  });
};
