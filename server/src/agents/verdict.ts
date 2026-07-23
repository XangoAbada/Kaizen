import { z } from 'zod';

/** Extract the LAST fenced ```json block from text and parse it. */
export function extractLastJsonBlock(text: string): unknown | null {
  const matches = [...text.matchAll(/```json\s*\r?\n([\s\S]*?)```/g)];
  const last = matches.at(-1);
  if (!last || !last[1]) {
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
  try {
    return JSON.parse(last[1]);
  } catch {
    return null;
  }
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

export function parseVerdict<S extends z.ZodTypeAny>(schema: S, resultText: string): z.output<S> | null {
  const raw = extractLastJsonBlock(resultText);
  if (raw === null) return null;
  const parsed = schema.safeParse(raw);
  return parsed.success ? (parsed.data as z.output<S>) : null;
}
