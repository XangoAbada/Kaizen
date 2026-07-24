import type { FeedbackEntry } from '@kaizen/shared';
import { preamble, jsonSchemaBlock } from './common.js';

export function plannerPrompt(input: {
  taskTitle: string;
  taskDescription: string;
  userPrompt?: string;
  feedback: FeedbackEntry[];
  knowledgeDirAbs: string | null;
  inlineDocs: { filename: string; content: string }[];
  otherDocs: { filename: string; summary: string }[];
  language?: string;
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

  const userInstructions = input.userPrompt?.trim()
    ? `## User instructions — HIGHEST PRIORITY (follow these above all else; they take precedence over the task description and any other guidance)
${input.userPrompt.trim()}`
    : '';

  const feedback = input.feedback.length
    ? `## Feedback on the plan / prior notes (chronological) — these OVERRIDE the task description wherever they conflict; revise the plan accordingly
${input.feedback
  .map((f) => `- [${f.source} @ ${f.createdAt}] ${f.text}`)
  .join('\n')}`
    : '';

  return `${preamble(input.language)}

## Mission
You are planning — NOT implementing — a change in the current working directory. Produce a concrete,
step-by-step implementation plan. You have READ-ONLY access: read the code and the knowledge base to
ground the plan, but do NOT create, edit, or delete any files and do NOT run \`git\` write commands.

## Task to plan
**${input.taskTitle}**

${input.taskDescription}

${userInstructions}

${feedback}

${kb}

## How to plan
- Explore the relevant parts of the codebase to understand existing patterns, files, and utilities to reuse.
- Prefer reusing existing functions/components over inventing new ones.
- The plan should be specific: name the files to change, the functions/components involved, and the order of steps.
- Call out risks, edge cases, and anything the user should decide.
- Keep it focused on this task; do not plan unrelated work.

The \`plan\` field must be a markdown document (steps, file paths, reasoning) that an implementer agent can follow directly.

${jsonSchemaBlock(`{"plan": "markdown implementation plan with concrete steps and file paths", "notes": "anything worth highlighting", "open_questions": ["decisions the user may want to weigh in on"]}`)}`;
}
