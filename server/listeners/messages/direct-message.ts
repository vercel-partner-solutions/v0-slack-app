import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { respondToMessage } from '../../lib/ai/respond-to-message';

const directMessageCallback = async ({
  message,
  event,
  say,
  logger,
  client,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>) => {
  if (event.channel_type === 'im' && 'text' in message && typeof message.text === 'string') {
    logger.debug('Direct message received:', message.text);

    if ('thread_ts' in message && message.thread_ts) {
      client.assistant.threads.setStatus({
        channel_id: message.channel,
        thread_ts: message.thread_ts,
        status: 'is typing...',
      });
    }

    const response = await respondToMessage(message.text, message.user);
    await say({
      text: response,
      thread_ts: message.ts,
    });
  } else {
    logger.debug('Direct message received with no text');
  }
};

export default directMessageCallback;
