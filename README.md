
# Slack Agent Template
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?demo-description=This%20is%20a%20generic%20Slack%20Agent%20template%20app%20built%20with%20Bolt%20for%20JavaScript%20%28TypeScript%29%20and%20the%20Nitro%20framework.%20Use%20this%20template%20to%20build%20Slack%20agent%20apps%20quickly%20and%20easily.&demo-image=%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2FSs9t7RkKlPtProrbDhZFM%2F0d11b9095ecf84c87a68fbdef6f12ad1%2FFrame__1_.png&demo-title=Slack%20Bolt%20with%20Nitro&demo-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-agent-template.git&env=SLACK_SIGNING_SECRET%2CSLACK_BOT_TOKEN&envDescription=These%20environment%20variables%20are%20required%20to%20deploy%20your%20Slack%20agent%20app%20to%20Vercel&envLink=https%3A%2F%2Fapi.slack.com%2Fapps&from=templates&project-name=Slack%20Bolt%20with%20Nitro&repository-name=slack-bolt-with-nitro&repository-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-agent-template.git&skippable-integrations=1&teamSlug=matthew-lewis-projects-c7bdd331)

This is a Slack Agent template built with Bolt for JavaScript (TypeScript) and the Nitro server framework.

## Prerequisites
- **Node.js 22+** - [Download here](https://nodejs.org/)
- **Slack workspace** - You need a workspace where you have permission to install apps
  - Create a new workspace [here](https://slack.com/create)
  - Or use a Slack developer sandbox [here](https://api.slack.com/developer-program)
- **Slack CLI** - [Installation guide](https://tools.slack.dev/slack-cli/guides/installing-the-slack-cli-for-mac-and-linux)
- **ngrok** - [Download here](https://ngrok.com/downloads)

## Installation
#### Clone and initialize Slack App
   ```bash
   slack create --template https://github.com/vercel-partner-solutions/slack-agent-template.git
   ```

#### Create a Slack App

1. Open [https://api.slack.com/apps/new](https://api.slack.com/apps/new) and choose "From an app manifest"
2. Choose the workspace you want to install the application to
3. Copy the contents of [manifest.json](./manifest.json) into the text box that says `*Paste your manifest code here*` (within the JSON tab) and click _Next_
4. Review the configuration and click _Create_
5. From the _Basic Information_ tab, copy your _Slack Signing Secret_ into your `.env` file under `SLACK_SIGNING_SECRET`.
6. Open the _Install App_ tab on the left menu. Click _Install to <Workspace_Name>_ and _Allow_ on the screen that follows.
7. On the following screen, copy the _Bot User OAuth Token_ into your `.env` file under `SLACK_BOT_TOKEN`.


#### Prepare for Local Development

1. In the terminal run `slack app link`
2. Select your Slack team in the terminal
3. Copy your App ID from the app you just created
4. Select `Local` when prompted
```
5. Open your [`config.json`](./.slack/config.json) file under `/.slack/config.json` and update your manifest source to `local`.
```json
{
  "manifest": {
    "source": "local"
  },
  "project_id": "<project-id-added-by-slack-cli>"
}
```
6. Start your local server with automatic tunneling using the `pnpm dev:tunnel` command. You can also use the generic `slack run` command if you do not want automatic tunneling and manifest updates. If prompted, select the workspace you'd like to grant access to. Select `yes` when asked _Update app settings with changes to the local manifest?_.

7. Open your Slack workspace and add your new Slack Agent to a channel. Your Slack Agent should respond whenever it's tagged in a message or sent a DM.

## Deploy to Vercel
1. Create a new Vercel project [here](https://www.vercel.com/new) or select _Add new..._ and _project_ from the Vercel dashboard
2. On the next screen, select *Import* next to your app repository but do *not* click _Deploy_
3. Create a new Slack app for Production. Open [https://api.slack.com/apps/new](https://api.slack.com/apps/new) and choose "From an app manifest"
4. Copy the contents of [manifest.json](./manifest.json) into the text box that says `*Paste your manifest code here*` (within the JSON tab) and click _Next_ and _Create_
5. From the _Basic Information_ tab, copy your _Slack Signing Secret_ into the Environment Variables dropdown on your new Vercel project window as `SLACK_SIGNING_SECRET`
6. On your Slack app window, open the _Install App_ tab on the left menu. Click _Install to <Workspace_Name>_ and _Allow_ on the screen that follows. Copy the _Bot User OAuth Token_
7. Open your new Vercel project window and paste this value as `SLACK_BOT_TOKEN` in the environment variables dropdown
8. Click _Deploy_
9. Once the deployment is complete, click _Continue to Dashboard_
10. Copy your production domain URL, seen under  _Domains_ on the _Overview_ tab
11. Open your Slack app settings and click _App Manifest_
12. Update the _url_ and _request_url_ fields of your App Manifest to the production domain. Make sure the `/api/events` path is preserved
13. At the top of the page, you will be prompted to verify the new URL
14. Your production app is now deployed and ready

## Project Structure

### [`manifest.json`](./manifest.json)

[`manifest.json`](./manifest.json) is a configuration for Slack apps. With a manifest, you can create an app with a pre-defined configuration, or adjust the configuration of an existing app.

### [`/server/app.ts`](./src/app.ts)

[`/app.ts`](./src/app.ts) is the entry point of the application. This file is kept minimal and primarily serves to route inbound requests.

[`/server/listeners`](./src/listeners)

Every incoming request is routed to a "listener". Inside this directory, we group each listener based on the Slack Platform feature used, so [`/listeners/shortcuts`](./src/listeners/shortcuts/index.ts) handles incoming [Shortcuts](https://api.slack.com/interactivity/shortcuts) requests, [`/listeners/views`](./src/listeners/views/index.ts) handles [View submissions](https://api.slack.com/reference/interaction-payloads/views#view_submission) and so on.

### [`/server`](./src/server)

This is your nitro server directory. Inside you have an [`api`](./src/server/api) folder that contains a [`events.post.ts`](./src/server/api/events.post.ts) file. This matches the request URL's defined in your [`manifest.json`](./manifest.json) file. Nitro uses file based routing for incoming requests. You can learn more about this [here](https://nitro.build/guide/routing).
