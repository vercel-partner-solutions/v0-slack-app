# Slack Bolt with Nitro Template

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?demo-description=This%20is%20a%20Slack%20Agent%20template%20built%20with%20Bolt%20for%20JavaScript%20(TypeScript)%20and%20the%20Nitro%20server%20framework.&demo-image=%2F%2Fimages.ctfassets.net%2Fe5382hct74si%2FSs9t7RkKlPtProrbDhZFM%2F0d11b9095ecf84c87a68fbdef6f12ad1%2FFrame__1_.png&demo-title=Slack%20Agent%20Template&demo-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-agent-template&env=SLACK_SIGNING_SECRET%2CSLACK_BOT_TOKEN&envDescription=These%20environment%20variables%20are%20required%20to%20deploy%20your%20Slack%20app%20to%20Vercel&envLink=https%3A%2F%2Fapi.slack.com%2Fapps&from=templates&project-name=Slack%20Agent%20Template&project-names=Comma%20separated%20list%20of%20project%20names%2Cto%20match%20the%20root-directories&repository-name=slack-agent-template&repository-url=https%3A%2F%2Fgithub.com%2Fvercel-partner-solutions%2Fslack-agent-template&root-directories=List%20of%20directory%20paths%20for%20the%20directories%20to%20clone%20into%20projects&skippable-integrations=1)

This is a Slack Agent template built with Bolt for JavaScript (TypeScript) and the Nitro server framework.

Before getting started, make sure you have a development workspace where you have permissions to install apps. You can use a [developer sandbox](https://api.slack.com/developer-program) or [create a workspace](https://slack.com/create)

## Getting Started

### Clone and install dependencies
```bash
git clone https://github.com/vercel-partner-solutions/slack-agent-template && cd slack-agent-template && pnpm install
```

### Create a Slack App

1. Open https://api.slack.com/apps/new and choose "From an app manifest"
2. Choose the workspace you want to use
3. Copy the contents of [`manifest.json`](./manifest.json) into the text box that says "Paste your manifest code here" (JSON tab) and click Next
4. Review the configuration and click Create
5. On the Install App tab, click Install to <Workspace_Name>. 
      - You will be redirected to the App Configuration dashboard
6. Copy the Bot User OAuth Token into your environment as `SLACK_BOT_TOKEN`
7. On the Basic Information tab, copy your Signing Secret into your environment as `SLACK_SIGNING_SECRET`

### Environment Setup

1. Add your `AI_GATEWAY_API_KEY` to your `.env` file. You can get one [here](https://vercel.com/d?to=%2F%5Bteam%5D%2F%7E%2Fai%2Fapi-keys%3Futm_source%3Dai_gateway_landing_page&title=Get+an+API+Key)
2. Add your `NGROK_AUTH_TOKEN` to your `.env` file. You can get one [here](https://dashboard.ngrok.com/login?state=X1FFBj9sgtS9-oFK_2-h15Xcg0zHPjp_b9edWYrpGBVvIluUPEAarKRIjpp8ZeCHNTljTyreeslpG6n8anuSCFUkgIxwLypEGOa4Ci_cmnXYLhOfYogHWB6TzWBYUmhFLPW0XeGn789mFV_muomVd7QizkgwuYW8Vz2wW315YIK5UPywQaIGFKV8)
3. In the terminal run `slack app link`
4. If prompted `update the manifest source to remote` select `yes`
5. Copy your App ID from the app you just created
6. Select `Local` when prompted
7. Open [`.slack/config.json`](./.slack/config.json) and update your manifest source to `local`
```json
{
  "manifest": {
    "source": "local"
  },
  "project_id": "<project-id-added-by-slack-cli>"
}
```
8. Start your local server using `slack run`. If prompted, select the workspace you'd like to grant access to 
- Select `yes` if asked "Update app settings with changes to the local manifest?"
9. Open your Slack workspace and add your new Slack Agent to a channel. Your Slack Agent should respond whenever it's tagged in a message or sent a DM

## Deploy to Vercel

1. Create a new Slack app for production following the steps from above
2. Create a new Vercel project [here](https://vercel.com/new) and select this repo
2. Copy the Bot User OAuth Token into your Vercel environment variables as `SLACK_BOT_TOKEN`
3. On the Basic Information tab, copy your Signing Secret into your Vercel environment variables as `SLACK_SIGNING_SECRET`
4. When your deployment has finished, open your App Manifest from the Slack App Dashboard
5. Update the manifest so all the `request_url` and `url` fields use `https://<your-app-domain>/api/slack/events`
6. Click save and you will be prompted to verify the URL
7. Open your Slack workspace and add your new Slack Agent to a channel. Your Slack Agent should respond whenever it's tagged in a message or sent a DM
    - _Note_: Make sure you add the production app, not the local app we setup earlier
8. Your app will now automatically build and deploy whenever you commit to your repo. More information [here](https://vercel.com/docs/git)


## Project Structure

### [`manifest.json`](./manifest.json)

[`manifest.json`](./manifest.json) is a configuration for Slack apps. With a manifest, you can create an app with a pre-defined configuration, or adjust the configuration of an existing app.

### [`/server/app.ts`](./server/app.ts)

[`/app.ts`](./server/app.ts) is the entry point of the application. This file is kept minimal and primarily serves to route inbound requests.

### [`/server/listeners`](./server/listeners)

Every incoming request is routed to a "listener". Inside this directory, we group each listener based on the Slack Platform feature used, so [`/listeners/shortcuts`](./server/listeners/shortcuts/index.ts) handles incoming [Shortcuts](https://api.slack.com/interactivity/shortcuts) requests, [`/listeners/views`](./server/listeners/views/index.ts) handles [View submissions](https://api.slack.com/reference/interaction-payloads/views#view_submission) and so on.

### [`/server`](./server)

This is your nitro server directory. Inside you have an [`api`](./server/api) folder that contains a [`events.post.ts`](./server/api/slack/events.post.ts) file. This matches the request URL's defined in your [`manifest.json`](./manifest.json) file. Nitro uses file based routing for incoming requests. You can learn more about this [here](https://nitro.build/guide/routing).