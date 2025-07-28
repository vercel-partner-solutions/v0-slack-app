# AI SDK Slackbot with Bolt 

An AI-powered assistant built with Slack's Bolt Javascript framework powered by the AI SDK by Vercel.

## Features
- Integrates with Slack's Bolt framework for easy Slack communication
- Use any LLM with the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway) and the AI SDK.
- Works in all Slack channels (public, private, multi-person DM) and as an assistant in direct messages.
- Maintains conversation context within both threads and direct messages
- Easily extensible architecture to add custom tools (e.g., knowledge search)

## Prerequisites
- Node.js 18+ installed
- Slack workspace where you can install apps. If you don’t have one setup, you can create one [here](https://slack.com/create). Or, you can create a Slack developer sandbox [here](https://api.slack.com/developer-program).
- Slack CLI installed. Install instructions [here](https://tools.slack.dev/slack-cli/guides/installing-the-slack-cli-for-mac-and-linux).

## Setup
1. Clone this repository
```
git clone https://github.com/vercel/vercel-bolt-template.git
```
2. Run `slack init` from your app's root directory
```
cd vercel-bolt-template && slack init
```
_This command may hang due to forcing `npm install`, there's an [open issue](https://github.com/slackapi/slack-cli/issues/170) to resolve this. Once you have a `./slack` directory with `hooks.json` and `config.json` you can exit the command with `ctrl/cmd + c`.

3. Update your start command under `hooks.json` to use `pnpm dev`
```json
{
  "hooks": {
    "get-hooks": "npx -q --no-install -p @slack/cli-hooks slack-cli-get-hooks",
    "start": "pnpm dev"
  }
}
```
4. Update your `config.json` file to use your local app manifest
```json
{
  "manifest": {
    "source": "local"
  },
  // the slack init command will add your project ID.
  "project_id": "<your-slack-project-id>"
  
}

```

5.  Run the `slack app install` command to create a new app using your local manifest.
- Installing this app on a free workspace will cause an **AI Assistant** feature error. Upgrade to a Pro workspace or use a [developer sandbox]((https://api.slack.com/developer-program)).

6. Run the `pnpm run dev:tunnel` command to start your development server. Slack will prompt you to create a new app, which is the _local_ version of your app.

7. Open the Slack App settings and select the local version of your app. You can find your app settings [here](https://api.slack.com/apps).

- Copy the **Signing Secret** from **Basic Information** to your `SLACK_SIGNING_SECRET` environment variable.
- Click the **Install App** tab and copy your **Bot User OAuth Token** to your `SLACK_BOT_TOKEN` environment variable.

8. Add your `AI_GATEWAY_API_KEY` environment variable. You can create one [here](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys&title=).

__Note__: You can also use your ``VERCEL_OIDC_TOKEN`` instead of an ``AI_GATEWAY_API_KEY``. You will need to run `vercel link` followed by `vercel env pull` to get this token.

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