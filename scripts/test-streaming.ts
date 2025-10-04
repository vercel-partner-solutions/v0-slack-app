import { createClient } from "v0-sdk";
import { StreamStateManager } from "../server/lib/v0/stream-manager";
import { MessageBinaryFormat } from "@v0-sdk/react";

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

const COLORS = {
  reset: '\x1b[0m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  bold: '\x1b[1m',
};

interface TaskTracker {
  id: string;
  type: string;
  lastState: 'active' | 'complete' | null;
}

const taskTrackers = new Map<string, TaskTracker>();
const textMessages = new Map<number, string>();

function extractText(element: unknown): string {
  if (typeof element === 'string') return element;
  if (!Array.isArray(element)) return '';
  
  const [tagName, props, ...children] = element;
  
  if (tagName === 'text') {
    return children[0] || '';
  }
  
  return children.map(child => extractText(child)).join('');
}

function extractHighLevelUpdates(content: MessageBinaryFormat) {
  const updates: string[] = [];
  
  if (!Array.isArray(content)) return updates;
  
  for (const [type, data] of content) {
    if (type === 0 && Array.isArray(data)) {
      for (const [elementIndex, element] of data.entries()) {
        if (!Array.isArray(element)) continue;
        
        const [tagName, props, ...children] = element;
        
        if (tagName === 'AssistantMessageContentPart' && props?.part) {
          const part = props.part;
          const taskId = part.id || '';
          
          if (part.type === 'task-thinking-v1' && part.parts && part.finishedAt) {
            for (const thinkingPart of part.parts) {
              if (thinkingPart.type === 'thinking-end' && thinkingPart.duration) {
                updates.push(`${COLORS.dim}${COLORS.cyan}💭 Thought for ${Math.round(thinkingPart.duration)}s${COLORS.reset}`);
              }
            }
          }
          
          else if (part.type === 'task-search-repo-v1') {
            let tracker = taskTrackers.get(taskId);
            const hasFinished = !!part.finishedAt;
            
            if (part.taskNameActive && !tracker) {
              updates.push(`${COLORS.dim}${COLORS.blue}🔍 ${part.taskNameActive}...${COLORS.reset}`);
              taskTrackers.set(taskId, { id: taskId, type: part.type, lastState: 'active' });
              tracker = taskTrackers.get(taskId);
            }
            
            if (hasFinished && tracker?.lastState === 'active') {
              updates.push(`${COLORS.blue}🔍 ${part.taskNameComplete}${COLORS.reset}`);
              tracker.lastState = 'complete';
            }
          }
          
          else if (part.type === 'task-coding-v1') {
            let tracker = taskTrackers.get(taskId);
            const hasFinished = !!part.finishedAt;
            
            if (part.taskNameActive && !tracker) {
              updates.push(`${COLORS.dim}${COLORS.yellow}📝 ${part.taskNameActive}...${COLORS.reset}`);
              taskTrackers.set(taskId, { id: taskId, type: part.type, lastState: 'active' });
              tracker = taskTrackers.get(taskId);
            }
            
            if (hasFinished && tracker?.lastState === 'active') {
              updates.push(`${COLORS.green}📄 ${part.taskNameComplete}${COLORS.reset}`);
              tracker.lastState = 'complete';
            }
          }
          
          else if (part.type === 'task-diagnostics-v1' && part.parts) {
            for (const diagPart of part.parts) {
              if (diagPart.type === 'diagnostics-passed') {
                updates.push(`${COLORS.green}🔧 No issues found${COLORS.reset}`);
              } else if (diagPart.type === 'diagnostics-failed') {
                updates.push(`${COLORS.yellow}⚠️ Issues found${COLORS.reset}`);
              }
            }
          }
        }
        
        else if (tagName === 'p') {
          const text = extractText(element).trim();
          const lastText = textMessages.get(elementIndex);
          
          if (text && text.length > 20 && text.endsWith('.') && text !== lastText) {
            textMessages.set(elementIndex, text);
            updates.push(`text-${elementIndex}:${text}`);
          }
        }
      }
    }
  }
  
  return updates;
}

const shownUpdates = new Set<string>();

async function testStreaming() {
  taskTrackers.clear();
  shownUpdates.clear();
  textMessages.clear();
  
  const prompt = "generate a basic counter and then after youve made that make a gradient circle that shifts color";
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

  console.log(`\n${COLORS.bold}${COLORS.cyan}Starting v0 stream...${COLORS.reset}\n`);
  console.log(`${COLORS.dim}Prompt: ${prompt}${COLORS.reset}\n`);

  const streamStateManager = new StreamStateManager();
  
  streamStateManager.subscribe(() => {
    const state = streamStateManager.getState();
    const updates = extractHighLevelUpdates(state.content);
    
    for (const update of updates) {
      if (update.startsWith('text-')) {
        const [key, ...textParts] = update.split(':');
        const text = textParts.join(':');
        if (!shownUpdates.has(key)) {
          console.log(`\n${text}`);
          shownUpdates.add(key);
        }
      } else {
        const updateKey = update;
        if (!shownUpdates.has(updateKey)) {
          console.log(update);
          shownUpdates.add(updateKey);
        }
      }
    }
  });

  await streamStateManager.processStream(stream, {
    onChatData: (data) => {
      if (data.object === 'chat.title') {
        console.log(`\n${COLORS.bold}Chat title: ${data.delta}${COLORS.reset}\n`);
      }
    },
    onComplete: () => {
      console.log(`\n${COLORS.green}${COLORS.bold}✅ Stream complete${COLORS.reset}\n`);
    },
    onError: (error) => {
      console.error(`\n${COLORS.yellow}❌ ERROR: ${error}${COLORS.reset}\n`);
    }
  });
}

testStreaming();
