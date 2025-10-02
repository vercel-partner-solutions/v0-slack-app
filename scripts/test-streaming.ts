import { createClient } from "v0-sdk";
import { StreamStateManager } from "./manager";
import { printStreamUpdate } from "./render-to-console";

const V0_TOKEN = process.env.V0_API_KEY;
const V0_SCOPE = process.env.V0_SCOPE;

if (!V0_TOKEN) {
  console.error("Error: V0_TOKEN environment variable is required");
  console.error("\nUsage: V0_TOKEN=your_token bun run test:streaming");
  process.exit(1);
}

const v0Client = createClient({
  apiKey: V0_TOKEN,
  ...(V0_SCOPE && { scope: V0_SCOPE }),
});

async function testStreaming() {
  const prompt = "Create a basic counter in react";
  const stream = await v0Client.chats.create({
    message: prompt,
    responseMode: "experimental_stream",
    modelConfiguration: {
      thinking: true,
    },
  });

  if (!(stream instanceof ReadableStream)) {
    console.error("Error: No stream found");
    process.exit(1);
  }

  const streamStateManager = new StreamStateManager();
  
  streamStateManager.subscribe(() => {
    const state = streamStateManager.getState();
    printStreamUpdate(state.content, state.isStreaming);
  });

  await streamStateManager.processStream(stream);
}

testStreaming();
