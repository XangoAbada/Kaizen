const BASE_PREAMBLE = `You are an autonomous agent run by Kaizen, a tool that continuously improves software projects.
This is a non-interactive headless session: never ask questions, never wait for confirmation — make reasonable decisions yourself and finish the job.
Your FINAL message must end with exactly one fenced \`\`\`json code block matching the required output schema. No text after that block.`;

/** Maps a language code to the English name used in prompt instructions. */
const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  pl: 'Polish',
};

/**
 * Shared prompt preamble. When `language` is set to a non-English code, appends an instruction to
 * write all natural-language output in that language while keeping JSON keys and enum values in English.
 */
export function preamble(language?: string): string {
  if (!language || language === 'en') return BASE_PREAMBLE;
  const name = LANGUAGE_NAMES[language] ?? language;
  return `${BASE_PREAMBLE}
Write all natural-language output (titles, descriptions, summaries, rationale, notes, findings) in ${name}. Keep JSON keys and enum values (e.g. kind/effort/impact/verdict/severity) exactly as specified in the schema, in English.`;
}

export function jsonSchemaBlock(example: string): string {
  return `Required final output — end your final message with a single fenced json block of this shape:
\`\`\`json
${example}
\`\`\``;
}
