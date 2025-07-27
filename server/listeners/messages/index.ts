import type { App } from '@slack/bolt';
import directMessageCallback from './direct-message';
import groupMessageCallback from './group-message';
import mpimMessageCallback from './mpim-message';

const register = (app: App) => {
  app.message(directMessageCallback);
  app.message(groupMessageCallback);
  app.message(mpimMessageCallback);
};

export default { register };
