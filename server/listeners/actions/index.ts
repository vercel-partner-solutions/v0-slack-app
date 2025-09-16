import type { App } from "@slack/bolt";
import { signInActionCallback } from "./sign-in-action";

const register = (app: App) => {
  app.action("sign-in-action", signInActionCallback);
};

export default { register };
