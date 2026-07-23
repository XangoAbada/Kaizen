import type { FeedbackEntry } from '@kaizen/shared';
import { PREAMBLE, jsonSchemaBlock } from './common.js';

export function implementerPrompt(input: {
  taskTitle: string;
  taskDescription: string;
  feedback: FeedbackEntry[];
  knowledgeDirAbs: string | null;
  inlineDocs: { filename: string; content: string }[];
  otherDocs: { filename: string; summary: string }[];
}): string {
  const kb = input.inlineDocs.length
    ? `## Project knowledge base (pre-loaded)
${input.inlineDocs.map((d) => `### ${d.filename}\n\n${d.content}`).join('\n\n---\n\n')}

${
  input.otherDocs.length && input.knowledgeDirAbs
    ? `More knowledge docs available under ${input.knowledgeDirAbs} (open if needed):\n${input.otherDocs
        .map((d) => `- ${d.filename}: ${d.summary}`)
        .join('\n')}`
    : ''
}`
    : '';

  const feedback = input.feedback.length
    ? `## Prior feedback / reviewer findings — address ALL of these
${input.feedback
  .map((f) => `- [${f.source} @ ${f.createdAt}] ${f.text}`)
  .join('\n')}`
    : '';

  return `${PREAMBLE}

## Task to implement
**${input.taskTitle}**

${input.taskDescription}

${feedback}

${kb}

## Rules
- Implement the task COMPLETELY in the current working directory (the target project).
- Follow the project's existing conventions (style, structure, naming, libraries).
- If the project has fast checks (typecheck, lint, unit tests), run them and fix what you broke.
- Do NOT run \`git commit\`, \`git push\` or otherwise alter git state — Kaizen tracks your changes as a working-tree diff.
- Do not modify unrelated code; keep the change focused on the task.

${jsonSchemaBlock(`{"summary": "what was implemented and how", "files_changed": ["path/one.ts"], "tests_run": "what checks you ran and their result", "notes": "anything the reviewer should know", "concerns": ["open questions or risks"]}`)}`;
}
