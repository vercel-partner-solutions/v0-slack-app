import type { App } from "@slack/bolt";
import { openInV0ActionCallback } from "./open-in-v0-action";
import { viewDemoActionCallback } from "./view-demo-action";

const register = (app: App) => {
  app.action("view_demo_action", viewDemoActionCallback);
  app.action("open_in_v0_action", openInV0ActionCallback);
};

export default { register };
