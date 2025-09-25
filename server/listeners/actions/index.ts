import type { App } from "@slack/bolt";
import { signInActionCallback } from "./sign-in-action";
import { signOutActionCallback } from "./sign-out-action";
import { openInV0ActionCallback } from "./open-in-v0-action";
import { viewDemoActionCallback } from "./view-demo-action";


const register = (app: App) => {
  app.action("sign-in-action", signInActionCallback);
  app.action("sign-out-action", signOutActionCallback);
  app.action("view_demo_action", viewDemoActionCallback);
  app.action("open_in_v0_action", openInV0ActionCallback);
};

export default { register };
