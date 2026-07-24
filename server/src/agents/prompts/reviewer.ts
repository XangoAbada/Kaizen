import type { FeedbackEntry } from '@kaizen/shared';
import { preamble, jsonSchemaBlock } from './common.js';

export function reviewerPrompt(input: {
  taskTitle: string;
  taskDescription: string;
  userPrompt?: string;
  feedback: FeedbackEntry[];
  implementerSummary: string;
  baseCommit: string | null;
  isGit: boolean;
  language?: string;
}): string {
  const diffInstruction = input.isGit
    ? input.baseCommit
      ? `Run \`git diff ${input.baseCommit}\` and \`git status --porcelain\` yourself to see the full change set (including untracked files). Read surrounding code where needed for context.`
      : `Run \`git status --porcelain\` and \`git diff\` to inspect the change set.`
    : `This project is not a git repository — inspect the files the implementer reported as changed and judge them in context.`;

  return `${preamble(input.language)}

## Mission
You are reviewing a change made by another agent in the current working directory. You have READ-ONLY access — do not modify anything.

## The task that was implemented
**${input.taskTitle}**

${input.taskDescription}

${
  input.userPrompt?.trim()
    ? `## User instructions — HIGHEST PRIORITY (these take precedence over the task description; the change MUST satisfy them)
${input.userPrompt.trim()}
`
    : ''
}
${
  input.feedback.length
    ? `## Later feedback and findings (chronological) — these OVERRIDE the original task description wherever they conflict
${input.feedback.map((f) => `- [${f.source} @ ${f.createdAt}] ${f.text}`).join('\n')}

Judge the change against the LATEST requirements (original description as amended by the feedback above).`
    : ''
}

## Implementer's report
${input.implementerSummary || '(none provided)'}

## How to inspect
${diffInstruction}

## Judge
1. Correctness — does the change work and do what the task asked?
2. Completeness — is anything from the task missing?
3. Regressions — could this break existing behavior?
4. Conventions — does it match the project's style and structure?

IMPORTANT: report \`needs_changes\` ONLY for material problems (bugs, missing requirements, likely regressions). Do not fail the review over style nitpicks or preferences — those go into findings with severity "low" while the verdict stays "approve". A needs_changes verdict triggers a costly automatic retry loop.

${jsonSchemaBlock(`{"verdict": "approve|needs_changes", "summary": "one-paragraph assessment", "findings": [{"severity": "high|medium|low", "file": "path", "issue": "...", "suggested_fix": "..."}]}`)}`;
}
