// ==========================================
// UTILITY TYPES
// ==========================================

interface ButtonConfig {
  text: string;
  emoji?: boolean;
  value: string;
  actionId: string;
  url?: string;
}

interface TaskStatus {
  icon: string;
  text: string;
}

// ==========================================
// SMALLER COMPONENTS
// ==========================================

export const ThinkingTimeContext = (thinkingTime: string) => ({
  type: "context",
  elements: [
    {
      type: "mrkdwn",
      text: thinkingTime,
    },
  ],
});

export const MainSectionText = (text: string) => ({
  type: "section",
  text: {
    type: "mrkdwn",
    text: text,
  },
});

export const TaskStatusContext = (status: TaskStatus) => ({
  type: "context",
  elements: [
    {
      type: "mrkdwn",
      text: `${status.icon} ${status.text}`,
    },
  ],
});

export const ActionButtons = (buttons: ButtonConfig[]) => ({
  type: "actions",
  elements: buttons.map((button) => ({
    type: "button",
    text: {
      type: "plain_text",
      text: button.text,
      emoji: button.emoji ?? true,
    },
    value: button.value,
    action_id: button.actionId,
    ...(button.url && { url: button.url }),
  })),
});

export const FeedbackActions = () => ({
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
});

// ==========================================
// MAIN BLOCK FUNCTIONS
// ==========================================

export const InitialThinkingBlock = (
  thinkingTime: string,
  mainText: string,
  taskStatuses: TaskStatus[],
  buttons: ButtonConfig[],
) => {
  return {
    blocks: [
      ThinkingTimeContext(thinkingTime),
      MainSectionText(mainText),
      ...taskStatuses.map((status) => TaskStatusContext(status)),
      ActionButtons(buttons),
    ],
  };
};

// Define a flexible block type that can handle various structures
type FlexibleBlockElement = {
  type?: string;
  text?: string | { text?: string; emoji?: boolean };
  value?: string;
  action_id?: string;
  url?: string;
};

type FlexibleBlock = {
  type?: string;
  elements?: Array<FlexibleBlockElement>;
  text?: { text?: string };
};

// Helper function to extract TaskStatus array from block structure
const extractTaskStatuses = (blocks: Array<FlexibleBlock>): TaskStatus[] => {
  const taskStatusBlocks = blocks.filter(
    (block, index) =>
      index >= 2 && // Skip thinking time (0) and main text (1) blocks
      block.type === "context" &&
      block.elements?.[0]?.type === "mrkdwn" &&
      index !== 0, // Ensure it's not the thinking time block
  );

  return taskStatusBlocks.map((block) => {
    const textElement = block.elements?.[0]?.text;
    const text =
      typeof textElement === "string" ? textElement : textElement?.text || "";
    // Parse the "icon text" format
    const spaceIndex = text.indexOf(" ");
    if (spaceIndex > 0) {
      return {
        icon: text.substring(0, spaceIndex),
        text: text.substring(spaceIndex + 1),
      };
    }
    // Fallback if format is unexpected
    return { icon: "❓", text: text };
  });
};

// Helper function to extract ButtonConfig array from block structure
const extractButtons = (blocks: Array<FlexibleBlock>): ButtonConfig[] => {
  const actionBlock = blocks.find((block) => block.type === "actions");
  if (!actionBlock || !actionBlock.elements) {
    return [];
  }

  return actionBlock.elements.map((element) => {
    const textObj =
      typeof element.text === "object" ? element.text : { text: element.text };

    const config: ButtonConfig = {
      text: textObj?.text || "Unknown",
      value: element.value || "",
      actionId: element.action_id || "",
    };

    if (textObj?.emoji !== undefined) {
      config.emoji = textObj.emoji;
    }

    if (element.url) {
      config.url = element.url;
    }

    return config;
  });
};

export const updateInitialThinkingBlock = (
  originalBlock: {
    blocks?: Array<FlexibleBlock>;
  },
  updates: {
    thinkingTime?: string;
    mainText?: string;
    taskStatuses?: TaskStatus[];
    buttons?: ButtonConfig[];
  },
) => {
  // Extract current values
  const thinkingElement = originalBlock?.blocks?.[0]?.elements?.[0]?.text;
  const currentThinkingTime =
    typeof thinkingElement === "string"
      ? thinkingElement
      : thinkingElement?.text;
  const currentMainText = originalBlock?.blocks?.[1]?.text?.text;
  const currentTaskStatuses = originalBlock?.blocks
    ? extractTaskStatuses(originalBlock.blocks)
    : undefined;
  const currentButtons = originalBlock?.blocks
    ? extractButtons(originalBlock.blocks)
    : undefined;

  // Ensure all required values are available (either from updates or original)
  const finalThinkingTime = updates.thinkingTime ?? currentThinkingTime;
  const finalMainText = updates.mainText ?? currentMainText;
  const finalTaskStatuses = updates.taskStatuses ?? currentTaskStatuses;
  const finalButtons = updates.buttons ?? currentButtons;

  if (
    !finalThinkingTime ||
    !finalMainText ||
    !finalTaskStatuses ||
    !finalButtons
  ) {
    throw new Error(
      "All parameters must be provided either in updates or original block",
    );
  }

  return InitialThinkingBlock(
    finalThinkingTime,
    finalMainText,
    finalTaskStatuses,
    finalButtons,
  );
};

export const FinishedBlock = (mainText: string, buttons: ButtonConfig[]) => {
  return {
    blocks: [
      MainSectionText(mainText),
      ActionButtons(buttons),
      FeedbackActions(),
    ],
  };
};
