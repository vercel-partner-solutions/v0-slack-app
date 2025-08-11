  // CommonJS variant
  const { spawn } = require("node:child_process");
  const fs = require("node:fs");
  const path = require("node:path");
  
const MANIFEST_PATH = path.join(__dirname, "..", "manifest.json");
const NGROK_PORT = Number.parseInt(
  process.env.NGROK_PORT ?? process.env.PORT ?? "3000",
  10,
);
const NGROK_STARTUP_DELAY = 3000;
const NGROK_API_URL = "http://localhost:4040/api/tunnels";

let ngrokProcess = null;
let slackProcess = null;
let isShuttingDown = false;
let ngrokStartedByUs = false;

function augmentPathForBrew() {
  const pathsToEnsure = [];
  // Apple Silicon
  pathsToEnsure.push("/opt/homebrew/bin");
  // Intel macOS
  pathsToEnsure.push("/usr/local/bin");
  // Common local bin
  pathsToEnsure.push("/usr/bin", "/bin", "/usr/sbin", "/sbin");

  const currentPath = process.env.PATH || "";
  const pathSegments = new Set(currentPath.split(path.delimiter));
  for (const p of pathsToEnsure) {
    if (!pathSegments.has(p) && fs.existsSync(p)) {
      pathSegments.add(p);
    }
  }
  process.env.PATH = Array.from(pathSegments).join(path.delimiter);
}

function checkBinaryAvailable(command, args = ["--version"]) {
  return new Promise((resolve) => {
    try {
      const probe = spawn(command, args, { stdio: "ignore", shell: false });
      let resolved = false;
      probe.once("error", (err) => {
        if (!resolved) {
          resolved = true;
          if (err && err.code === "ENOENT") resolve(false);
          else resolve(false);
        }
      });
      probe.once("spawn", () => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      });
      // If process exits quickly, still treat as available
      probe.once("exit", () => {
        if (!resolved) {
          resolved = true;
          resolve(true);
        }
      });
    } catch {
      resolve(false);
    }
  });
}

function cleanup() {
  if (isShuttingDown) return;
  isShuttingDown = true;

  console.log("\n🛑 Shutting down development environment...");

  const processes = [
    { name: "ngrok tunnel", process: ngrokProcess, shouldKill: ngrokStartedByUs },
    { name: "slack app", process: slackProcess, shouldKill: true },
  ];

  processes.forEach(({ name, process, shouldKill }) => {
    if (process && shouldKill) {
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
      shell: false,
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
      setTimeout(async () => {
        try {
          const res = await fetch(NGROK_API_URL);
          if (!res.ok) {
            throw new Error(`HTTP ${res.status}`);
          }
          const response = await res.json();
          const httpsTunnel = response.tunnels?.find((t) => t.proto === "https");

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
        } catch (error) {
          if (attempt < maxAttempts) {
            console.log(
              `   Waiting for ngrok to start (attempt ${attempt}/${maxAttempts})...`,
            );
            pollNgrokUrl(attempt + 1, maxAttempts);
          } else {
            console.error(
              "❌ Failed to get ngrok URL after multiple attempts:",
              error.message ?? String(error),
            );
            console.error(
              "   Make sure ngrok is running and accessible at localhost:4040",
            );
            reject(error);
          }
        }
      }, attempt === 1 ? NGROK_STARTUP_DELAY : 2000);
    };

    pollNgrokUrl();
  });
}

async function getExistingNgrokUrl() {
  try {
    const res = await fetch(NGROK_API_URL);
    if (!res.ok) return undefined;
    const response = await res.json();
    const httpsTunnel = response.tunnels?.find((t) => t.proto === "https");
    return httpsTunnel?.public_url;
  } catch {
    return undefined;
  }
}

async function ensureNgrok() {
  const existingUrl = await getExistingNgrokUrl();
  if (existingUrl) {
    console.log(`🌐 Reusing existing ngrok tunnel: ${existingUrl}`);
    ngrokStartedByUs = false;
    return existingUrl;
  }
  const url = await startNgrok();
  ngrokStartedByUs = true;
  return url;
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
        shell: false,
      });
    } else {
      slackProcess = spawn("slack", ["run"], {
        stdio: "inherit",
        shell: false,
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
    // Ensure common binary paths are available
    augmentPathForBrew();

    // Verify required binaries
    const [hasSlackCli, hasNgrokBinary] = await Promise.all([
      checkBinaryAvailable("slack", ["--version"]),
      checkBinaryAvailable("ngrok", ["version"]),
    ]);

    if (!hasSlackCli) {
      throw new Error(
        "Slack CLI not found in PATH. Install: https://api.slack.com/automation/cli/install",
      );
    }

    if (!hasNgrokBinary) {
      console.warn(
        "⚠️ ngrok binary not found in PATH. If an ngrok daemon is already running at localhost:4040, we'll reuse it.",
      );
    }

    // Ensure ngrok tunnel is available (reuse if already running)
    const ngrokUrl = await ensureNgrok();

    // Update manifest with ngrok URL
    await updateManifest(ngrokUrl);

    // Resolve app_id (env > .slack/apps.dev.json > .slack/apps.json)
    const appId = (() => {
      if (process.env.SLACK_APP_ID) return process.env.SLACK_APP_ID;
      const devPath = path.join(__dirname, "..", ".slack", "apps.dev.json");
      const prodPath = path.join(__dirname, "..", ".slack", "apps.json");
      for (const p of [devPath, prodPath]) {
        if (fs.existsSync(p)) {
          try {
            const apps = JSON.parse(fs.readFileSync(p, "utf8"));
            const firstKey = Object.keys(apps)[0];
            return firstKey ? apps[firstKey]?.app_id : undefined;
          } catch {}
        }
      }
      return undefined;
    })();

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
