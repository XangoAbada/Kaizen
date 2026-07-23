import type { RunOutputEntry } from '@kaizen/shared';

export interface ParsedResult {
  subtype: string;
  isError: boolean;
  resultText: string;
  numTurns: number | null;
  costUsd: number | null;
  sessionId: string | null;
}

export interface ParserCallbacks {
  onEntry: (entry: RunOutputEntry) => void;
  onInit: (info: { sessionId: string | null; model: string | null }) => void;
  onResult: (result: ParsedResult) => void;
  onRawLine: (line: string) => void;
}

function ts(): string {
  return new Date().toISOString();
}

function summarizeToolUse(block: Record<string, unknown>): string {
  const name = String(block.name ?? 'tool');
  const input = (block.input ?? {}) as Record<string, unknown>;
  const hint =
    (input.file_path as string) ??
    (input.path as string) ??
    (input.command as string) ??
    (input.pattern as string) ??
    (input.query as string) ??
    (input.url as string) ??
    '';
  const shortHint = String(hint).slice(0, 120);
  return shortHint ? `${name}: ${shortHint}` : name;
}

/**
 * Incremental NDJSON parser for `claude -p --output-format stream-json --verbose`.
 * Tolerates unknown event types (forward compatibility with CLI updates).
 */
export function createStreamJsonParser(cb: ParserCallbacks): { push: (chunk: string) => void; flush: () => void } {
  let buffer = '';

  function handleLine(line: string): void {
    const trimmed = line.trim();
    if (!trimmed) return;
    cb.onRawLine(trimmed);
    let obj: Record<string, unknown>;
    try {
      obj = JSON.parse(trimmed);
    } catch {
      cb.onEntry({ kind: 'system', text: trimmed.slice(0, 500), ts: ts() });
      return;
    }
    const type = obj.type as string;
    if (type === 'system') {
      if (obj.subtype === 'init') {
        cb.onInit({
          sessionId: (obj.session_id as string) ?? null,
          model: (obj.model as string) ?? null,
        });
        cb.onEntry({ kind: 'system', text: `session started (model: ${obj.model ?? '?'})`, ts: ts() });
      }
      return;
    }
    if (type === 'assistant') {
      const message = obj.message as Record<string, unknown> | undefined;
      const content = (message?.content ?? []) as Record<string, unknown>[];
      for (const block of content) {
        if (block.type === 'text' && typeof block.text === 'string' && block.text.trim()) {
          cb.onEntry({ kind: 'assistant_text', text: block.text, ts: ts() });
        } else if (block.type === 'tool_use') {
          cb.onEntry({ kind: 'tool_use', text: summarizeToolUse(block), ts: ts() });
        }
      }
      return;
    }
    if (type === 'user') {
      // tool results — keep short
      const message = obj.message as Record<string, unknown> | undefined;
      const content = (message?.content ?? []) as Record<string, unknown>[];
      for (const block of content) {
        if (block.type === 'tool_result') {
          let text = '';
          if (typeof block.content === 'string') text = block.content;
          else if (Array.isArray(block.content)) {
            text = (block.content as Record<string, unknown>[])
              .filter((c) => c.type === 'text')
              .map((c) => String(c.text ?? ''))
              .join('\n');
          }
          const isError = block.is_error === true;
          const short = text.trim().slice(0, 300);
          if (short) {
            cb.onEntry({ kind: 'tool_result', text: isError ? `⚠ ${short}` : short, ts: ts() });
          }
        }
      }
      return;
    }
    if (type === 'result') {
      cb.onResult({
        subtype: String(obj.subtype ?? ''),
        isError: obj.is_error === true,
        resultText: typeof obj.result === 'string' ? obj.result : '',
        numTurns: typeof obj.num_turns === 'number' ? obj.num_turns : null,
        costUsd: typeof obj.total_cost_usd === 'number' ? obj.total_cost_usd : null,
        sessionId: (obj.session_id as string) ?? null,
      });
      return;
    }
    // unknown event type — ignore silently (forward compat)
  }

  return {
    push(chunk: string): void {
      buffer += chunk;
      let idx: number;
      while ((idx = buffer.indexOf('\n')) >= 0) {
        const line = buffer.slice(0, idx);
        buffer = buffer.slice(idx + 1);
        handleLine(line);
      }
    },
    flush(): void {
      if (buffer.trim()) handleLine(buffer);
      buffer = '';
    },
  };
}
