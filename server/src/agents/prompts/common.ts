export const PREAMBLE = `You are an autonomous agent run by Kaizen, a tool that continuously improves software projects.
This is a non-interactive headless session: never ask questions, never wait for confirmation — make reasonable decisions yourself and finish the job.
Your FINAL message must end with exactly one fenced \`\`\`json code block matching the required output schema. No text after that block.`;

export function jsonSchemaBlock(example: string): string {
  return `Required final output — end your final message with a single fenced json block of this shape:
\`\`\`json
${example}
\`\`\``;
}
