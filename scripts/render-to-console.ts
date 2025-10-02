import { MessageBinaryFormat } from "@v0-sdk/react";

interface MessageElement {
  type: 'text' | 'html' | 'component' | 'content-part' | 'code-project'
  key: string
  data: unknown
  props?: Record<string, unknown>
  children?: MessageElement[]
}

interface ProcessedMessage {
  elements: MessageElement[]
  hasContent: boolean
}

function processElements(
  data: unknown,
  keyPrefix: string,
): MessageElement | null {
  if (!Array.isArray(data)) {
    return null
  }

  const children = data
    .map((item, index) => {
      const key = `${keyPrefix}-${index}`
      return processElement(item, key)
    })
    .filter(Boolean) as MessageElement[]

  return {
    type: 'component',
    key: keyPrefix,
    data: 'elements',
    children,
  }
}

function processElement(
  element: unknown,
  key: string,
): MessageElement | null {
  if (typeof element === 'string') {
    return {
      type: 'text',
      key,
      data: element,
    }
  }

  if (!Array.isArray(element)) {
    return null
  }

  const [tagName, props, ...children] = element

  if (!tagName) {
    return null
  }

  if (tagName === 'AssistantMessageContentPart') {
    return {
      type: 'content-part',
      key,
      data: {
        part: props.part,
      },
    }
  }

  if (tagName === 'Codeblock') {
    return {
      type: 'code-project',
      key,
      data: {
        language: props.lang,
        code: children[0],
      },
    }
  }

  if (tagName === 'text') {
    return {
      type: 'text',
      key,
      data: children[0] || '',
    }
  }

  const processedChildren = children
    .map((child, childIndex) => {
      const childKey = `${key}-child-${childIndex}`
      return processElement(child, childKey)
    })
    .filter(Boolean) as MessageElement[]

  return {
    type: 'html',
    key,
    data: {
      tagName,
      props,
    },
    children: processedChildren,
  }
}

function processMessage(content: MessageBinaryFormat): ProcessedMessage {
  if (!Array.isArray(content)) {
    return {
      elements: [],
      hasContent: false,
    }
  }

  const elements = content
    .map(([type, data], index) => {
      const key = `msg-${index}`

      if (type === 0) {
        return processElements(data, key)
      }

      if (type === 1) {
        return null
      }

      return null
    })
    .filter(Boolean) as MessageElement[]

  return {
    elements,
    hasContent: elements.length > 0,
  }
}

const COLORS = {
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m',
  cyan: '\x1b[36m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
}

function renderElementToConsole(element: MessageElement, indent = 0): string {
  const prefix = '  '.repeat(indent)

  switch (element.type) {
    case 'text':
      return String(element.data)

    case 'content-part': {
      const part = (element.data as { part?: { type?: string; title?: string; content?: string } }).part
      if (!part) return ''

      const lines: string[] = []
      
      if (part.type === 'thinking') {
        lines.push(`\n${COLORS.dim}${COLORS.cyan}💭 Thinking: ${part.title || ''}${COLORS.reset}`)
        if (part.content) {
          lines.push(`${COLORS.dim}${part.content}${COLORS.reset}`)
        }
      } else if (part.type === 'task') {
        lines.push(`\n${COLORS.green}✓ ${part.title || ''}${COLORS.reset}`)
        if (part.content) {
          lines.push(`${COLORS.dim}${part.content}${COLORS.reset}`)
        }
      }
      
      return lines.join('\n')
    }

    case 'code-project': {
      const codeData = element.data as { language?: string; code?: string }
      const lang = codeData.language || 'text'
      const code = codeData.code || ''
      
      return `\n${COLORS.bold}${COLORS.magenta}[${lang}]${COLORS.reset}\n${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}\n${code}\n${COLORS.dim}${'─'.repeat(60)}${COLORS.reset}\n`
    }

    case 'html': {
      const htmlData = element.data as { tagName?: string }
      const tagName = htmlData.tagName
      const children = element.children?.map(child => renderElementToConsole(child, indent)).join('') || ''

      switch (tagName) {
        case 'h1':
          return `\n${COLORS.bold}${COLORS.cyan}# ${children}${COLORS.reset}\n`
        case 'h2':
          return `\n${COLORS.bold}## ${children}${COLORS.reset}\n`
        case 'h3':
          return `\n${COLORS.bold}### ${children}${COLORS.reset}\n`
        case 'p':
          return `\n${children}\n`
        case 'code':
          return `${COLORS.yellow}\`${children}\`${COLORS.reset}`
        case 'pre':
          return `\n${COLORS.dim}${children}${COLORS.reset}\n`
        case 'strong':
        case 'b':
          return `${COLORS.bold}${children}${COLORS.reset}`
        case 'em':
        case 'i':
          return `${COLORS.dim}${children}${COLORS.reset}`
        case 'ul':
          return `\n${children}`
        case 'ol':
          return `\n${children}`
        case 'li':
          return `${prefix}• ${children}\n`
        case 'a':
          return `${COLORS.blue}${COLORS.bold}${children}${COLORS.reset}`
        case 'br':
          return '\n'
        default:
          return children
      }
    }

    case 'component':
      return element.children?.map(child => renderElementToConsole(child, indent)).join('') || ''

    default:
      return ''
  }
}

export function renderToConsole(content: MessageBinaryFormat): string {
  const processed = processMessage(content)
  
  if (!processed.hasContent) {
    return ''
  }

  return processed.elements
    .map(element => renderElementToConsole(element))
    .join('')
}

export function clearConsole(): void {
  console.clear()
}

export function printStreamUpdate(content: MessageBinaryFormat, isStreaming: boolean): void {
  clearConsole()
  
  console.log(`${COLORS.bold}${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}`)
  console.log(`${COLORS.bold}v0 Response${isStreaming ? ` ${COLORS.yellow}(streaming...)${COLORS.reset}` : COLORS.reset}`)
  console.log(`${COLORS.cyan}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${COLORS.reset}\n`)
  
  const rendered = renderToConsole(content)
  console.log(rendered)
  
  if (isStreaming) {
    console.log(`\n${COLORS.dim}${COLORS.yellow}⏳ Streaming in progress...${COLORS.reset}`)
  } else {
    console.log(`\n${COLORS.green}✓ Complete${COLORS.reset}`)
  }
}

