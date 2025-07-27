import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from "@slack/bolt";
import { respondToMessage } from "../../lib/ai/respond-to-message";

const groupMessageCallback = async ({
	message,
	event,
	say,
	logger,
}: SlackEventMiddlewareArgs<"message"> & AllMiddlewareArgs) => {
	if (
		event.channel_type === "group" &&
		"text" in message &&
		typeof message.text === "string"
	) {
		logger.debug("Group message received:", message.text);
		const response = await respondToMessage(message.text, message.user);
		await say({
			text: response,
			thread_ts: message.ts,
		});
	} else {
		logger.debug("Group message received with no text");
	}
};

export default groupMessageCallback;
