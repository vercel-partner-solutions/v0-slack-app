import type { Block, Button, KnownBlock, WebClient } from "@slack/web-api";
import { getSignInUrl } from "./home";

export const OpenInV0Button = ({ webUrl }: { webUrl: string }): Button => {
  return {
    type: "button",
    text: {
      type: "plain_text",
      text: "Open in v0",
    },
    url: webUrl,
    action_id: "open_in_v0_action",
    value: webUrl,
  };
};

export const ViewDemoButton = ({ demoUrl }: { demoUrl: string }): Button => {
  return {
    type: "button",
    text: {
      type: "plain_text",
      text: "View demo",
    },
    url: demoUrl,
    action_id: "view_demo_action",
    value: demoUrl,
  };
};

export const FeedbackButtons = () => {
  return {
    type: "context_actions",
    elements: [
      {
        type: "feedback_buttons",
        action_id: "feedback",
        positive_button: {
          text: {
            type: "plain_text",
            text: "Good Response",
          },
          value: "positive",
        },
        negative_button: {
          text: {
            type: "plain_text",
            text: "Bad Response",
          },
          value: "negative",
        },
      },
      {
        type: "icon_button",
        action_id: "remove",
        icon: "trash",
        text: {
          type: "plain_text",
          text: "Remove",
        },
      },
    ],
  };
};

export const createActionBlocks = ({
  demoUrl,
  webUrl,
  chatId,
}: {
  demoUrl?: string;
  webUrl?: string;
  chatId: string;
}) => {
  const actionElements = [];

  if (demoUrl) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "View Demo",
        emoji: true,
      },
      value: demoUrl,
      action_id: "view_demo_action",
      url: demoUrl,
    });
  }

  if (webUrl) {
    actionElements.push({
      type: "button",
      text: {
        type: "plain_text",
        text: "Open in v0",
        emoji: true,
      },
      value: webUrl,
      action_id: "open_in_v0_action",
      url: webUrl,
    });
  }

  return [
    {
      type: "actions",
      elements: actionElements,
    },
    {
      type: "context_actions",
      elements: [
        {
          type: "feedback_buttons",
          action_id: "feedback",
          positive_button: {
            text: {
              type: "plain_text",
              text: "Good Response",
            },
            value: `positive_${chatId}`,
          },
          negative_button: {
            text: {
              type: "plain_text",
              text: "Bad Response",
            },
            value: `negative_${chatId}`,
          },
        },
        {
          type: "icon_button",
          action_id: "remove",
          icon: "trash",
          text: {
            type: "plain_text",
            text: "Remove",
          },
          value: chatId,
        },
      ],
    },
  ];
};

export const ThinkingBlock = ({ text }: { text: string }) => {
  return {
    type: "context",
    elements: [
      {
        type: "mrkdwn",
        text,
      },
    ],
  };
};

type Task = {
  name: string;
  status: string;
  previewLink: URL;
};

export const TaskRow = ({ task }: { task: Task }) => {
  return {
    type: "table_row",
    elements: [
      {
        type: "rich_text_section",
        elements: [{ type: "text", text: task.name }],
      },
      {
        type: "rich_text_section",
        elements: [{ type: "text", text: task.status }],
      },
      {
        type: "rich_text_section",
        elements: [{ type: "text", text: task.previewLink.toString() }],
      },
    ],
  };
};

export const TaskHeaderRow = () => {
  return {
    type: "table_row",
    elements: [
      { type: "text", text: "Task" },
      { type: "text", text: "Status" },
      { type: "text", text: "Preview" },
    ],
  };
};

export const ToDoBlock = ({ tasks }: { tasks: Task[] }) => {
  return {
    type: "table",
    rows: [TaskHeaderRow(), ...tasks.map((task) => TaskRow({ task }))],
  };
};

export const InitialMessageBlock = ({ text }: { text: string }) => {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text,
    },
  };
};

export const InitialThinkingBlock = ({
  thinkingText,
  messageText,
  tasks,
}: {
  thinkingText: string;
  messageText: string;
  tasks: Task[];
}) => {
  return {
    blocks: [
      ThinkingBlock({ text: thinkingText }),
      InitialMessageBlock({ text: messageText }),
      ToDoBlock({ tasks }),
    ],
  };
};

export const updateTasksBlock = async ({
  newTasks,
  messageTs,
  client,
  channel,
}: {
  newTasks: Task[];
  messageTs: string;
  client: WebClient;
  channel: string;
}) => {
  // Get the original message to preserve existing blocks
  const originalMessage = await client.conversations.history({
    channel: channel,
    latest: messageTs,
    inclusive: true,
    limit: 1,
  });

  if (!originalMessage.messages?.[0]?.blocks) {
    throw new Error("Original message not found or has no blocks");
  }

  const originalBlocks = originalMessage.messages[0].blocks;

  // Filter out the existing task-related blocks (table blocks)
  // Using 'any' here because the blocks may contain custom types not in standard Slack types
  const nonTaskBlocks = originalBlocks.filter(
    (block) => !((block as any).type === "table"), // eslint-disable-line @typescript-eslint/no-explicit-any
  );

  // Create the new task block
  const newTaskBlock = ToDoBlock({ tasks: newTasks });

  // Update with preserved blocks plus new tasks
  await client.chat.update({
    channel: channel,
    ts: messageTs,
    blocks: [...nonTaskBlocks, newTaskBlock] as (Block | KnownBlock)[],
  });
};

export const SignInBlock = ({
  user,
  teamId,
  appId,
}: {
  user: string;
  teamId: string;
  appId: string;
}) => {
  return {
    type: "section",
    text: {
      type: "mrkdwn",
      text: `Hi, <@${user}>. Please sign in to continue.`,
    },
    accessory: {
      type: "button",
      text: {
        type: "plain_text",
        text: "Sign In",
      },
      url: getSignInUrl(user, teamId, appId),
      action_id: "sign-in-action",
      value: "sign-in",
    },
  };
};
