import { z } from 'zod';

/**
 * Extract the LAST fenced ```json block from text and parse it.
 *
 * A non-greedy `...*?```` would stop at the first ``` after the opener — and agents routinely
 * write a literal ``` inside a JSON string value, which silently truncated the block and threw
 * the whole result away. So: walk openers last→first and, for each, try the LONGEST closing
 * candidate first, returning the first slice that actually parses.
 */
export function extractLastJsonBlock(text: string): unknown | null {
  const openers = [...text.matchAll(/```json[ \t]*\r?\n/g)];
  const fences = [...text.matchAll(/```/g)].map((m) => m.index);

  for (let i = openers.length - 1; i >= 0; i--) {
    const opener = openers[i]!;
    const start = opener.index + opener[0].length;
    // `text.length` first covers output truncated before the closing fence.
    // ponytail: O(openers × fences) — a handful of each in real agent output.
    const candidates = [text.length, ...fences.filter((f) => f >= start).reverse()];
    for (const end of candidates) {
      try {
        return JSON.parse(text.slice(start, end));
      } catch {
        // try a shorter candidate
      }
    }
  }

  // fallback: maybe the whole text is bare JSON
  const trimmed = text.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return null;
    }
  }
  return null;
}

export const reviewerVerdictSchema = z.object({
  verdict: z.enum(['approve', 'needs_changes']),
  summary: z.string().default(''),
  findings: z
    .array(
      z.object({
        severity: z.enum(['high', 'medium', 'low']).default('medium'),
        file: z.string().default(''),
        issue: z.string(),
        suggested_fix: z.string().default(''),
      }),
    )
    .default([]),
});
export type ReviewerVerdict = z.infer<typeof reviewerVerdictSchema>;

export const suggestionsOutputSchema = z.array(
  z.object({
    title: z.string(),
    description: z.string().default(''),
    rationale: z.string().default(''),
    kind: z.enum(['feature', 'improvement', 'bugfix', 'refactor']).default('improvement'),
    effort: z.enum(['S', 'M', 'L']).default('M'),
    impact: z.enum(['S', 'M', 'L']).default('M'),
  }),
);
export type SuggestionsOutput = z.infer<typeof suggestionsOutputSchema>;

export const plannerOutputSchema = z.object({
  plan: z.string(),
  notes: z.string().default(''),
  open_questions: z.array(z.string()).default([]),
});
export type PlannerOutput = z.infer<typeof plannerOutputSchema>;

export const implementerOutputSchema = z.object({
  summary: z.string(),
  files_changed: z.array(z.string()).default([]),
  tests_run: z.string().default(''),
  notes: z.string().default(''),
  concerns: z.array(z.string()).default([]),
});
export type ImplementerOutput = z.infer<typeof implementerOutputSchema>;

export const analyzerOutputSchema = z.object({
  files_written: z.array(z.string()).default([]),
  headline_summary: z.string().default(''),
});
export type AnalyzerOutput = z.infer<typeof analyzerOutputSchema>;

export const brainstormOutputSchema = z.object({
  summary: z.string().default(''),
  open_questions: z.array(z.string()).default([]),
});
export type BrainstormOutput = z.infer<typeof brainstormOutputSchema>;

export function parseVerdict<S extends z.ZodTypeAny>(schema: S, resultText: string): z.output<S> | null {
  const raw = extractLastJsonBlock(resultText);
  if (raw === null) return null;
  const parsed = schema.safeParse(raw);
  return parsed.success ? (parsed.data as z.output<S>) : null;
}
