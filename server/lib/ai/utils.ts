/**
 * Extracts the final summary text from v0's structured response format
 * Removes <Thinking>, <V0LaunchTasks>, <CodeProject> tags and returns clean summary
 */
export function extractV0Summary(rawContent: string): string {
  if (!rawContent) return "";

  // Remove <Thinking> blocks
  let cleaned = rawContent.replace(/<Thinking>[\s\S]*?<\/Thinking>/gi, "");

  // Remove <V0LaunchTasks> blocks
  cleaned = cleaned.replace(/<V0LaunchTasks>[\s\S]*?<\/V0LaunchTasks>/gi, "");

  // Remove <CodeProject> blocks (including self-closing and multi-line variants)
  cleaned = cleaned.replace(/<CodeProject[^>]*>[\s\S]*?<\/CodeProject>/gi, "");
  cleaned = cleaned.replace(/<CodeProject[^>]*\/>/gi, "");

  // Remove any remaining XML-like tags that might be left
  cleaned = cleaned.replace(/<\/?[A-Za-z][A-Za-z0-9]*[^>]*>/g, "");

  // Clean up extra whitespace and newlines
  cleaned = cleaned.trim();
  cleaned = cleaned.replace(/\n\s*\n/g, "\n"); // Remove empty lines
  cleaned = cleaned.replace(/^\s+|\s+$/gm, ""); // Trim each line

  // If there are multiple paragraphs, take the last meaningful one
  const paragraphs = cleaned.split("\n").filter((p) => p.trim().length > 0);

  if (paragraphs.length === 0) {
    return "Task completed successfully.";
  }

  // Return the last substantial paragraph (usually the summary)
  return paragraphs[paragraphs.length - 1];
}
