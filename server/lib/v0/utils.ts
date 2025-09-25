const ThinkingBlockRegex = /<Thinking>[\s\S]*?<\/Thinking>/gi;
const V0LaunchTasksBlockRegex = /<V0LaunchTasks>[\s\S]*?<\/V0LaunchTasks>/gi;
const CodeProjectBlockRegex = /<CodeProject>[\s\S]*?<\/CodeProject>/gi;
const XmlTagRegex = /<\/?[A-Za-z][A-Za-z0-9]*[^>]*>/g;
const FileBlockRegex = /\n*```[\s\S]*?file=[\s\S]*?```\n*/gi;

export function cleanV0Stream(rawContent: string): string {
  if (!rawContent) return "";

  return rawContent
    .replace(ThinkingBlockRegex, "")
    .replace(V0LaunchTasksBlockRegex, "")
    .replace(CodeProjectBlockRegex, "")
    .replace(FileBlockRegex, "")
    .replace(XmlTagRegex, "")
    .replace(/\n\s*\n\s*\n+/g, "\n\n") // Collapse multiple newlines to maximum of 2
    .trim();
}
