import type { App } from "@slack/bolt";
import { loginCommandCallback } from "./login-command";

const register = (app: App) => {
  app.command("/sign-in", loginCommandCallback);
};

export default { register };
