import { KNOWLEDGE_SECTIONS } from '@kaizen/shared';
import { preamble, jsonSchemaBlock } from './common.js';

const sectionList = KNOWLEDGE_SECTIONS.map((s) => `- \`${s.filename}\` — ${s.brief}`).join('\n');

export function brainstormPrompt(input: {
  projectName: string;
  knowledgeDirAbs: string;
  transcript: { role: 'user' | 'assistant'; text: string }[];
  currentDocs: { filename: string; content: string }[];
  language?: string;
}): string {
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
- Base the content ONLY on what the user has actually said or clearly implied. Do NOT invent features, users, scope or technology the user has not asked for.
- The knowledge base records DECISIONS, not options. Anything still undecided does NOT go into a file — raise it in \`open_questions\` in your final output instead, so the user can answer it next round.
- Write a file only once the conversation gives you real content for it. Several sections describe an existing codebase (\`10-screens.md\`, \`40-architecture.md\`, \`50-code-map.md\`, \`60-api-surface.md\`, \`80-integrations.md\`, \`90-run-and-config.md\`, \`95-testing.md\`) — for an app with no code these stay empty until the user has decided something concrete about them. Always keep \`00-overview.md\` present.
- Keep it light: this is early-stage thinking, not a 40-page spec. Concise bullets over long prose.
- Move from abstract to concrete: problem/vision → features → data → technology.

## Conversation so far
${conversation}

## Current knowledge base
${current}

## Output files
Write these markdown files into the knowledge directory: ${input.knowledgeDirAbs}
${sectionList}

Rules for every file:
- Start with front-matter:
---
title: <short human title>
summary: <one-line summary of the file's content>
---
- Then a single top-level heading (# H1), then \`##\`/\`###\` sections. Prefer bulleted lists over walls of text.
- Wrap tech names, commands and config keys in \`inline code\`. Use GitHub-flavored markdown tables where they fit.
- Never add a changelog or a "what changed this round" section.

${jsonSchemaBlock(`{"summary": "one short paragraph telling the user what you captured/changed this round and what you still need from them", "open_questions": ["question the user should answer next"]}`)}`;
}
