# AI SDK Slackbot with Bolt 

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fai-sdk-slackbot-nitro&env=SLACK_BOT_TOKEN,SLACK_SIGNING_SECRET&project-name=ai-sdk-slackbot&repository-name=ai-sdk-slackbot&demo-title=AI%20SDK%20Slackbot&demo-description=A%20Slackbot%20built%20with%20the%20AI%20SDK%20and%20Nitro%20Framework.)
<br>
An AI-powered assistant built with Slack's Bolt Javascript framework powered by the AI SDK by Vercel.

## Features
- Integrates with Slack's Bolt framework for easy Slack communication
- Use any LLM with the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) and the AI SDK.
- Works in all Slack channels (public, private, multi-person DM) and as an assistant in direct messages.
- Maintains conversation context within both threads and direct messages
- Easily extensible architecture to add custom tools (e.g., knowledge search)

## Prerequisites

### Required
- **Node.js 18+** - [Download here](https://nodejs.org/)
- **pnpm** - This project uses pnpm as the package manager. Install with `npm install -g pnpm`
- **Slack workspace** - You need a workspace where you have permission to install apps
  - Create a new workspace [here](https://slack.com/create)
  - Or use a Slack developer sandbox [here](https://api.slack.com/developer-program)
- **Slack CLI** - [Installation guide](https://tools.slack.dev/slack-cli/guides/installing-the-slack-cli-for-mac-and-linux)
- **ngrok** - [Download here](https://ngrok.com/downloads)

## Setup

### 1. Clone and Initialize
```bash
git clone https://github.com/vercel/ai-sdk-slackbot
cd nitro-app
pnpm install
```

### 2. Initialize Slack App
```bash
slack init
```
> **Note**: This command may hang due to forcing `npm install` ([known issue](https://github.com/slackapi/slack-cli/issues/170)). Once you see a `./slack` directory with `hooks.json` and `config.json`, you can exit with `Ctrl/Cmd + C`.

### 3. Configure Slack Hooks
Update your start command in `.slack/hooks.json`:
```json
{
  "hooks": {
    "get-hooks": "npx -q --no-install -p @slack/cli-hooks slack-cli-get-hooks",
    "start": "pnpm dev"
  }
}
```
### 4. Configure Local Manifest
Update `.slack/config.json` to use your local app manifest:
```json
{
  "manifest": {
    "source": "local"
  },
  // the slack init command will add your project ID.
  "project_id": "<your-slack-project-id>"
  
}

```

### 5. Create and Install Slack App
```bash
slack app install
```
> ⚠️ **Important**: Installing on a free workspace will cause **AI Assistant** feature errors. Use a Pro workspace or [developer sandbox](https://api.slack.com/developer-program).

### 6. Start Development Server
```bash
pnpm run dev:tunnel
```
Slack will prompt you to create another app. This will be the app you use for local development.

### 7. Configure Environment Variables
Create a `.env` file in your project root with the following variables:

```env
SLACK_SIGNING_SECRET="your_signing_secret_here"
SLACK_BOT_TOKEN="xoxb-your-bot-token-here"
AI_GATEWAY_API_KEY="your_ai_gateway_key_here"
```

**Get your Slack credentials:**
1. Go to [Slack App Settings](https://api.slack.com/apps) and select your local app
2. **Basic Information** → Copy **Signing Secret** → Add to `SLACK_SIGNING_SECRET`
3. **Install App** → Copy **Bot User OAuth Token** → Add to `SLACK_BOT_TOKEN`

**Get your AI Gateway API Key:**
- Create one at [Vercel AI Gateway](https://vercel.com/ai/api-keys)

**Alternative - Using Vercel OIDC Token:**
```bash
vercel link
vercel env pull
```

## Usage

### Start Development Server (Recommended)
```bash
pnpm run dev:tunnel
```
This starts your app with automatic ngrok tunneling and local manifest updates.

### Alternative: Manual Development
```bash
slack run
```
Starts the app without automatic tunnel creation. You will have to manually update your app's `manifest.json` file.

### Using the Bot
1. Invite the bot to any channel: `@YourBotName`
2. The bot will respond in public and private channels when `@` mentioned.
3. The bot will respond to any messages sent in DMs (`im`), multi-person DMs (`mpim`) and group messages (`group`) that it is added to.

### Enable the AI Assistant feature
1. Open your Slack workspace preferences (`ctrl/cmd` + `,`)
2. Open the **Navigation** tab and scroll to **App agents & assistants**
3. Toggle the AI Assistant you would like to enable
4. In the top right of your Slack workspace you will now see an icon to toggle a sidebar where you can interact with your AI Assistant

## Project Structure

### `manifest.json`

`manifest.json` is a configuration for Slack apps. With a manifest, you can create an app with a pre-defined configuration, or adjust the configuration of an existing app.

### `/server/app.ts`

`/server/app.ts` is the entry point for the application and is the file you'll run to start the server. This project aims to keep this file as thin as possible, primarily using it as a way to route inbound requests.

### `/server/listeners`

Every incoming request is routed to a "listener". Inside this directory, we group each listener based on the Slack Platform feature used, so `/listeners/shortcuts` handles incoming [Shortcuts](https://api.slack.com/interactivity/shortcuts) requests, `/listeners/views` handles [View submissions](https://api.slack.com/reference/interaction-payloads/views#view_submission) and so on.

### `/server/api/events.post.ts`

`events.ts` creates a serverless function which will listen to all incoming **POST** requests from your Slack workspace and properly route them to your `app.ts` file which will then respond to the incoming request.

### `/scripts/dev.tunnel.js`

`dev.tunnel.js` is a helper command to improve the local developer experience. It will automatically create an `ngrok` tunnel and update your local app `manifest.json` to use the tunnel url. You can use `slack run` to start your app without the automatic tunnel creation.

## Troubleshooting

### Common Issues

**This workspace is not eligible for the next generation Slack platform.**
- Solution: Upgrade to Slack Pro or use a [developer sandbox](https://api.slack.com/developer-program)

**`slack init` command hangs**
- This is a [known issue](https://github.com/slackapi/slack-cli/issues/170)
- Wait for `.slack/` directory to appear, then exit with `Ctrl/Cmd + C`

**Bot not responding**
- Check your `.env` file has correct values
- Verify bot token starts with `xoxb-`
- Ensure the bot is invited to the channel
- Check the development server is running

**Ngrok tunnel issues**
- Try restarting with `pnpm run dev:tunnel`
- Check if ngrok is properly installed
- Verify your ngrok account limits

**Environment variables not loading**
- Ensure `.env` file is in project root
- Restart your development server
- Check for typos in variable names