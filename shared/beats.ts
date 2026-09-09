const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));

export const NO_EMOJI = /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/u;

// The beat content rules, single-sourced: persisted beats (validateBeatsFile),
// CLI overrides (pipeline/run.ts), and the Studio editor all enforce the same numbers.
export const BEAT_MIN = 2;
export const BEAT_MAX = 6;
export const BEAT_MAX_CHARS = 90;

export function beatDurationSec(text: string): number {
  return clamp(1.8 + text.length / 16, 2.4, 4.2);
}

const VOCATIVE = /^O [^,]{2,30},\s*/;

// skipCapitalize: when true, preserves original casing for continuation beats (second half of midpoint splits) to maintain visual continuity as one thought across cards
function polish(line: string, skipCapitalize: boolean = false): string {
  let s = line.trim().replace(VOCATIVE, '').trim();
  if (!s) return s;
  if (!skipCapitalize) {
    s = s[0].toUpperCase() + s.slice(1);
  }
  if (s.length > BEAT_MAX_CHARS) {
    const cut = s.lastIndexOf(' ', BEAT_MAX_CHARS - 1);
    s = s.slice(0, cut > 40 ? cut : BEAT_MAX_CHARS - 1).trimEnd() + '…';
  }
  if (!/[.!?…,]$/.test(s)) s += '.';
  return s;
}

function midpointSplit(sentence: string): [string, string] {
  const mid = sentence.length / 2;
  const punct = [...sentence.matchAll(/[,;—]\s/g)].map((m) => m.index!);
  if (punct.length > 0) {
    const at = punct.reduce((a, b) => (Math.abs(a - mid) < Math.abs(b - mid) ? a : b));
    return [sentence.slice(0, at + 1), sentence.slice(at + 1)];
  }
  const spaces = [...sentence.matchAll(/ /g)].map((m) => m.index!);
  const at = spaces.length ? spaces.reduce((a, b) => (Math.abs(a - mid) < Math.abs(b - mid) ? a : b)) : mid;
  return [sentence.slice(0, at), sentence.slice(at)];
}

export function beatsFromTranslation(english: string): string[] {
  const sentences = english
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
  let beats = sentences.map((s) => polish(s)).filter(Boolean);
  if (beats.length === 1) {
    const [a, b] = midpointSplit(sentences[0]);
    beats = [polish(a), polish(b, true)].filter(Boolean);
  }
  return beats.slice(0, 5);
}

export function validateBeatsFile(beats: Record<string, string[]>, verseRefs: Set<string>): void {
  for (const [ref, lines] of Object.entries(beats)) {
    if (!verseRefs.has(ref)) throw new Error(`unknown ref ${ref}`);
    if (lines.length < BEAT_MIN || lines.length > BEAT_MAX)
      throw new Error(`${ref}: ${BEAT_MIN}-${BEAT_MAX} beats required, got ${lines.length}`);
    for (const line of lines) {
      if (line.length > BEAT_MAX_CHARS)
        throw new Error(`${ref}: beat exceeds ${BEAT_MAX_CHARS} chars: "${line.slice(0, 40)}…"`);
      if (NO_EMOJI.test(line)) throw new Error(`${ref}: emoji not allowed on screen: "${line}"`);
      if (!line.trim()) throw new Error(`${ref}: empty beat`);
    }
  }
}
