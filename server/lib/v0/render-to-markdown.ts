import type { MessageBinaryFormat } from "@v0-sdk/react";

interface MessageElement {
  type: "text" | "html" | "component" | "content-part" | "code-project";
  key: string;
  data: unknown;
  props?: Record<string, unknown>;
  children?: MessageElement[];
}

interface ProcessedMessage {
  elements: MessageElement[];
  hasContent: boolean;
}

function processElements(
  data: unknown,
  keyPrefix: string,
): MessageElement | null {
  if (!Array.isArray(data)) {
    return null;
  }

  const children = data
    .map((item, index) => {
      const key = `${keyPrefix}-${index}`;
      return processElement(item, key);
    })
    .filter(Boolean) as MessageElement[];

  return {
    type: "component",
    key: keyPrefix,
    data: "elements",
    children,
  };
}

function processElement(element: unknown, key: string): MessageElement | null {
  if (typeof element === "string") {
    return {
      type: "text",
      key,
      data: element,
    };
  }

  if (!Array.isArray(element)) {
    return null;
  }

  const [tagName, props, ...children] = element;

  if (!tagName) {
    return null;
  }

  if (tagName === "AssistantMessageContentPart") {
    return {
      type: "content-part",
      key,
      data: {
        part: props.part,
      },
    };
  }

  if (tagName === "Codeblock") {
    return {
      type: "code-project",
      key,
      data: {
        language: props.lang,
        code: children[0],
      },
    };
  }

  if (tagName === "text") {
    return {
      type: "text",
      key,
      data: children[0] || "",
    };
  }

  const processedChildren = children
    .map((child, childIndex) => {
      const childKey = `${key}-child-${childIndex}`;
      return processElement(child, childKey);
    })
    .filter(Boolean) as MessageElement[];

  return {
    type: "html",
    key,
    data: {
      tagName,
      props,
    },
    children: processedChildren,
  };
}

function processMessage(content: MessageBinaryFormat): ProcessedMessage {
  if (!Array.isArray(content)) {
    return {
      elements: [],
      hasContent: false,
    };
  }

  const elements = content
    .map(([type, data], index) => {
      const key = `msg-${index}`;

      if (type === 0) {
        return processElements(data, key);
      }

      if (type === 1) {
        return null;
      }

      return null;
    })
    .filter(Boolean) as MessageElement[];

  return {
    elements,
    hasContent: elements.length > 0,
  };
}

function renderElementToMarkdown(element: MessageElement): string {
  switch (element.type) {
    case "text":
      return String(element.data);

    case "content-part": {
      const part = (
        element.data as {
          part?: { type?: string; title?: string; content?: string };
        }
      ).part;
      if (!part) return "";

      const lines: string[] = [];

      if (part.type === "thinking") {
        lines.push(`\n*💭 Thinking: ${part.title || ""}*`);
        if (part.content) {
          lines.push(`_${part.content}_`);
        }
      } else if (part.type === "task") {
        lines.push(`\n*✓ ${part.title || ""}*`);
        if (part.content) {
          lines.push(`_${part.content}_`);
        }
      }

      return lines.join("\n");
    }

    case "code-project": {
      const codeData = element.data as { language?: string; code?: string };
      const code = codeData.code || "";

      return `\n\`\`\`\n${code}\n\`\`\`\n`;
    }

    case "html": {
      const htmlData = element.data as { tagName?: string };
      const tagName = htmlData.tagName;
      const children =
        element.children
          ?.map((child) => renderElementToMarkdown(child))
          .join("") || "";

      switch (tagName) {
        case "h1":
          return `\n*${children}*\n`;
        case "h2":
          return `\n*${children}*\n`;
        case "h3":
          return `\n*${children}*\n`;
        case "p":
          return `\n${children}\n`;
        case "code":
          return `\`${children}\``;
        case "pre":
          return `\n\`\`\`\n${children}\n\`\`\`\n`;
        case "strong":
        case "b":
          return `*${children}*`;
        case "em":
        case "i":
          return `_${children}_`;
        case "ul":
          return `\n${children}`;
        case "ol":
          return `\n${children}`;
        case "li":
          return `• ${children}\n`;
        case "a":
          return children;
        case "br":
          return "\n";
        default:
          return children;
      }
    }

    case "component":
      return (
        element.children
          ?.map((child) => renderElementToMarkdown(child))
          .join("") || ""
      );

    default:
      return "";
  }
}

export function renderToMarkdown(content: MessageBinaryFormat): string {
  const processed = processMessage(content);

  if (!processed.hasContent) {
    return "";
  }

  return processed.elements
    .map((element) => renderElementToMarkdown(element))
    .join("")
    .trim();
}
