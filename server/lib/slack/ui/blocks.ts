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

export const updateInitialThinkingBlock = (
  originalBlock: {
    blocks?: Array<{
      elements?: Array<{ text?: string }>;
      text?: { text?: string };
    }>;
  },
  updates: {
    thinkingTime?: string;
    mainText?: string;
    taskStatuses?: TaskStatus[];
    buttons?: ButtonConfig[];
  },
) => {
  // Extract current values
  const currentThinkingTime = originalBlock?.blocks?.[0]?.elements?.[0]?.text;
  const currentMainText = originalBlock?.blocks?.[1]?.text?.text;

  // Ensure all required values are available (either from updates or original)
  const finalThinkingTime = updates.thinkingTime ?? currentThinkingTime;
  const finalMainText = updates.mainText ?? currentMainText;
  const finalTaskStatuses = updates.taskStatuses;
  const finalButtons = updates.buttons;

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
