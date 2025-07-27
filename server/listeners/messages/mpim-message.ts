import type { AllMiddlewareArgs, SlackEventMiddlewareArgs } from '@slack/bolt';
import { respondToMessage } from '../../lib/ai/respond-to-message';

const mpimMessageCallback = async ({
  message,
  event,
  say,
  logger,
}: AllMiddlewareArgs & SlackEventMiddlewareArgs<'message'>) => {
  if (event.channel_type === 'mpim' && 'text' in message && typeof message.text === 'string') {
    logger.debug('MPIM message received:', message.text);
    const response = await respondToMessage(message.text, message.user);
    await say(response);
  } else {
    logger.debug('MPIM message received with no text');
  }
};

export default mpimMessageCallback;
