import { preamble, jsonSchemaBlock } from './common.js';

export function suggesterPrompt(input: {
  projectName: string;
  knowledgeDirAbs: string;
  inlineDocs: { filename: string; content: string }[];
  otherDocs: { filename: string; summary: string }[];
  existingTitles: string[];
  useWebResearch: boolean;
  focus?: string;
  language?: string;
}): string {
  const inline = input.inlineDocs
    .map((d) => `### ${d.filename}\n\n${d.content}`)
    .join('\n\n---\n\n');
  const others = input.otherDocs.length
    ? `Additional knowledge docs you may open from ${input.knowledgeDirAbs} if needed:\n${input.otherDocs
        .map((d) => `- ${d.filename}: ${d.summary}`)
        .join('\n')}`
    : '';
  const web = input.useWebResearch
    ? `\n## Competitor research\nUse WebSearch to research 2-3 comparable/competitor applications in the same space. Derive feature gaps and popular capabilities this app lacks. Mention the competitor inspiration in the rationale of relevant suggestions.`
    : '';
  const focus = input.focus ? `\n## User focus\nThe user asked to focus suggestions on: ${input.focus}` : '';
  const dedupe = input.existingTitles.length
    ? `\nDo NOT duplicate these already-existing suggestions:\n${input.existingTitles.map((t) => `- ${t}`).join('\n')}`
    : '';

  return `${preamble(input.language)}

## Mission
Propose improvements and new features for the application "${input.projectName}" (its source code is in the current working directory — you may open files to verify feasibility).

## Knowledge base (pre-loaded)
${inline}

${others}
${web}${focus}

## Requirements for suggestions
- Propose 5-10 concrete suggestions.
- Each must be small enough for ONE autonomous coding-agent session to implement (hours, not days).
- Each must be feasible in THIS codebase — check the code when unsure.
- Mix of kinds is welcome: feature | improvement | bugfix | refactor.
- effort and impact: S (small), M (medium), L (large).${dedupe}

${jsonSchemaBlock(`[{"title": "...", "description": "what to build and where", "rationale": "why it's worth it", "kind": "feature|improvement|bugfix|refactor", "effort": "S|M|L", "impact": "S|M|L"}]`)}`;
}
