import { preamble, jsonSchemaBlock } from './common.js';

/** Fixed greenfield knowledge-base files the brainstormer writes to (a light PRD/design doc). */
export const BRAINSTORM_FILES = [
  '00-overview.md',
  '10-users.md',
  '20-features.md',
  '30-tech-stack.md',
  '40-scope.md',
  '50-open-questions.md',
] as const;

export function brainstormPrompt(input: {
  projectName: string;
  knowledgeDirAbs: string;
  transcript: { role: 'user' | 'assistant'; text: string }[];
  currentDocs: { filename: string; content: string }[];
  language?: string;
}): string {
  const fileList = BRAINSTORM_FILES.map((f) => `- ${f}`).join('\n');

  const conversation = input.transcript.length
    ? input.transcript
        .map((m) => `**${m.role === 'user' ? 'User' : 'You (assistant)'}:** ${m.text}`)
        .join('\n\n')
    : '(no messages yet)';

  const current = input.currentDocs.length
    ? input.currentDocs.map((d) => `### ${d.filename}\n\n${d.content}`).join('\n\n---\n\n')
    : '(the knowledge base is empty — this is the first round)';

  return `${preamble(input.language)}

## Mission
You are helping a user brainstorm a BRAND-NEW application called "${input.projectName}". No source code exists yet — you are shaping the *idea* into structured knowledge (a lightweight PRD / design document), one conversational round at a time.

Read the conversation so far and the current knowledge base, then WRITE or UPDATE the markdown files below so they capture everything decided so far. This is an iterative process: refine and extend the existing content rather than throwing it away, and fold in whatever the latest user message adds or changes.

## Rules
- Base the content ONLY on what the user has actually said or clearly implied. Do NOT invent features, users, or scope the user has not asked for.
- When something is undecided, DON'T guess — record it as a bullet in \`50-open-questions.md\` so the user can weigh in next round.
- Keep it light: this is early-stage thinking, not a 40-page spec. Concise bullets over long prose.
- Move from abstract to concrete: problem/vision → users → features → tech → scope. A later file may be sparse early on; that's fine.

## Conversation so far
${conversation}

## Current knowledge base
${current}

## Output files
Write these markdown files into the knowledge directory: ${input.knowledgeDirAbs}
${fileList}

Suggested contents:
- \`00-overview.md\` — the problem, the vision, goals and how success is measured.
- \`10-users.md\` — target users / personas and what they need.
- \`20-features.md\` — core features and scope; separate MVP from later.
- \`30-tech-stack.md\` — proposed stack and a short architecture sketch.
- \`40-scope.md\` — non-goals, constraints and assumptions.
- \`50-open-questions.md\` — unresolved decisions the user should confirm.

Rules for every file:
- Start with front-matter:
---
title: <short human title>
summary: <one-line summary of the file's content>
---
- Then a single top-level heading (# H1), then \`##\`/\`###\` sections. Prefer bulleted lists over walls of text.
- Wrap tech names, commands and config keys in \`inline code\`. Use GitHub-flavored markdown tables where they fit.
- Only write files that have real content yet; still, always keep \`00-overview.md\` present.

${jsonSchemaBlock(`{"summary": "one short paragraph telling the user what you captured/changed this round and what you still need from them", "open_questions": ["question the user should answer next"]}`)}`;
}
