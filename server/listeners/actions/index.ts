import type { App } from "@slack/bolt";
import { openInV0ActionCallback } from "./open-in-v0-action";
import { viewDemoActionCallback } from "./view-demo-action";

const register = (app: App) => {
  app.action("view_demo_action_id", viewDemoActionCallback);
  app.action("open_in_v0_action_id", openInV0ActionCallback);
};

export default { register };
