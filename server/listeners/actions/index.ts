import type { App } from "@slack/bolt";
import { signInActionCallback } from "./sign-in-action";
import { signOutActionCallback } from "./sign-out-action";

const register = (app: App) => {
  app.action("sign-in-action", signInActionCallback);
  app.action("sign-out-action", signOutActionCallback);
};

export default { register };
