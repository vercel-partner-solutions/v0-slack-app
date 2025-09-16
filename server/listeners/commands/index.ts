import type { App } from "@slack/bolt";
import { signInCommandCallback } from "./sign-in-command";

const register = (app: App) => {
  app.command("/sign-in", signInCommandCallback);
};

export default { register };
