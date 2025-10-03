import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";

export const v0LinkUnfurlCallback = async ({
  event,
  logger,
  client,
}: SlackEventMiddlewareArgs<"link_shared"> & AllMiddlewareArgs) => {
  logger.info("Received v0 link unfurl event", { event });

  await client.chat.postEphemeral({
    channel: event.channel,
    thread_ts: event.thread_ts,
    user: event.user,
    text: `Hi <@${event.user}>, This chat isn't available to your whole team.`,
  });
};
