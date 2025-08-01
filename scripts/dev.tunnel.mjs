import { exec, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MANIFEST_PATH = path.join(__dirname, "..", "manifest.json");
const NGROK_PORT = 3000;
const NGROK_STARTUP_DELAY = 3000;
const NGROK_API_URL = "http://localhost:4040/api/tunnels";

let ngrokProcess = null;
let slackProcess = null;
let isShuttingDown = false;

function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🛑 Shutting down development environment...");

  const processes = [
    { name: "ngrok tunnel", process: ngrokProcess },
    { name: "slack app", process: slackProcess },
  ];

  processes.forEach(({ name, process }) => {
    if (process) {
      console.log(`   Stopping ${name}...`);
      process.kill("SIGTERM");
    }
  });

  setTimeout(() => {
    console.log("✅ Cleanup complete");
    process.exit(0);
  }, 1000);
}

process.on("SIGINT", cleanup);
process.on("SIGTERM", cleanup);

async function updateManifest(ngrokUrl) {
  try {
    console.log("📝 Updating manifest.json...");

    if (!fs.existsSync(MANIFEST_PATH)) {
      throw new Error(`Manifest file not found at ${MANIFEST_PATH}`);
    }

    const manifestContent = fs.readFileSync(MANIFEST_PATH, "utf8");
    let manifest;

    try {
      manifest = JSON.parse(manifestContent);
    } catch (parseError) {
      throw new Error(`Invalid JSON in manifest file: ${parseError.message}`);
    }

    const eventsUrl = `${ngrokUrl}/api/events`;
    let updatedCount = 0;

    // Update slash commands URL
    if (manifest.features?.slash_commands) {
      manifest.features.slash_commands.forEach((cmd) => {
        if (cmd.url !== eventsUrl) {
          cmd.url = eventsUrl;
          updatedCount++;
        }
      });
    }

    // Update event subscriptions URL
    if (manifest.settings?.event_subscriptions?.request_url !== eventsUrl) {
      if (manifest.settings?.event_subscriptions) {
        manifest.settings.event_subscriptions.request_url = eventsUrl;
        updatedCount++;
      }
    }

    // Update interactivity URL
    if (manifest.settings?.interactivity?.request_url !== eventsUrl) {
      if (manifest.settings?.interactivity) {
        manifest.settings.interactivity.request_url = eventsUrl;
        updatedCount++;
      }
    }

    fs.writeFileSync(MANIFEST_PATH, `${JSON.stringify(manifest, null, 2)}\n`);
    console.log(`✅ Updated ${updatedCount} URL(s) in manifest.json`);

    return true;
  } catch (error) {
    console.error("❌ Failed to update manifest.json:", error.message);
    throw error;
  }
}

function startNgrok() {
  return new Promise((resolve, reject) => {
    console.log("🔗 Starting ngrok tunnel...");
    ngrokProcess = spawn("ngrok", ["http", NGROK_PORT.toString()], {
      stdio: "pipe",
      shell: true,
    });

    ngrokProcess.on("error", (error) => {
      console.error("❌ Failed to start ngrok:", error.message);
      console.error(
        "   Make sure ngrok is installed: https://ngrok.com/download",
      );
      reject(error);
    });

    // Wait for ngrok to start and get the URL
    const pollNgrokUrl = (attempt = 1, maxAttempts = 10) => {
      setTimeout(
        () => {
          exec(`curl -s ${NGROK_API_URL}`, (error, stdout) => {
            if (error) {
              if (attempt < maxAttempts) {
                console.log(
                  `   Waiting for ngrok to start (attempt ${attempt}/${maxAttempts})...`,
                );
                pollNgrokUrl(attempt + 1, maxAttempts);
                return;
              }
              console.error(
                "❌ Failed to get ngrok URL after multiple attempts:",
                error.message,
              );
              console.error(
                "   Make sure ngrok is running and accessible at localhost:4040",
              );
              reject(error);
              return;
            }

            try {
              const response = JSON.parse(stdout);
              const httpsTunnel = response.tunnels?.find(
                (t) => t.proto === "https",
              );

              if (httpsTunnel) {
                const ngrokUrl = httpsTunnel.public_url;
                console.log(`🌐 Ngrok tunnel ready: ${ngrokUrl}`);
                resolve(ngrokUrl);
              } else if (attempt < maxAttempts) {
                console.log(
                  `   No HTTPS tunnel found yet (attempt ${attempt}/${maxAttempts})...`,
                );
                pollNgrokUrl(attempt + 1, maxAttempts);
              } else {
                const error = new Error(
                  "No HTTPS tunnel found after multiple attempts",
                );
                console.error("❌", error.message);
                reject(error);
              }
            } catch (parseError) {
              if (attempt < maxAttempts) {
                console.log(
                  `   Invalid response from ngrok API (attempt ${attempt}/${maxAttempts})...`,
                );
                pollNgrokUrl(attempt + 1, maxAttempts);
              } else {
                console.error(
                  "❌ Failed to parse ngrok response after multiple attempts:",
                  parseError.message,
                );
                reject(parseError);
              }
            }
          });
        },
        attempt === 1 ? NGROK_STARTUP_DELAY : 2000,
      );
    };

    pollNgrokUrl();
  });
}

async function startSlackApp(appId) {
  return new Promise((resolve, reject) => {
    if (!appId) {
      console.log("🚀 Starting Slack app");
    } else {
      console.log(`🚀 Starting Slack app ${appId}...`);
    }

    if (appId) {
      slackProcess = spawn("slack", ["run", "-a", appId], {
        stdio: "inherit",
        shell: true,
      });
    } else {
      slackProcess = spawn("slack", ["run"], {
        stdio: "inherit",
        shell: true,
      });
    }

    slackProcess.on("error", (error) => {
      console.error("❌ Failed to start Slack app:", error.message);
      console.error(
        "   Make sure Slack CLI is installed: https://api.slack.com/automation/cli/install",
      );
      reject(error);
    });

    slackProcess.on("spawn", () => {
      resolve();
    });

    // Handle unexpected exit
    slackProcess.on("exit", (code) => {
      if (!isShuttingDown && code !== 0) {
        console.error(`❌ Slack app exited unexpectedly with code ${code}`);
      }
    });
  });
}

async function start() {
  try {
    // Start ngrok tunnel
    const ngrokUrl = await startNgrok();

    // Update manifest with ngrok URL
    await updateManifest(ngrokUrl);

    // Get the app_id from ./slack/apps.dev.json
    let appsDev = {};
    const appsDevPath = path.join(__dirname, "..", ".slack", "apps.dev.json");
    if (fs.existsSync(appsDevPath)) {
      appsDev = JSON.parse(fs.readFileSync(appsDevPath, "utf8"));
    }

    const firstAppKey = Object.keys(appsDev)[0];
    const appId = firstAppKey ? appsDev[firstAppKey]?.app_id : undefined;

    // Start Slack app (which will start the dev server via hooks)
    await startSlackApp(appId);
  } catch (error) {
    console.error(
      "\n❌ Failed to start development environment:",
      error.message,
    );
    cleanup();
    process.exit(1);
  }
}

start();
