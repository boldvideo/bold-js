import type { VoiceCaptionSegment, VoiceCaptionTurn, VoiceSpeaker } from './types';

/** Split m:ss / h:mm:ss into seekable segments without interpreting invalid timestamps. */
export function splitVoiceTimestamps(text: string): VoiceCaptionSegment[] {
  const segments: VoiceCaptionSegment[] = [];
  // Match an entire colon-separated token so an invalid time cannot yield a valid suffix.
  const pattern = /\b\d+(?::\d+)+\b/g;
  let offset = 0;
  for (const match of text.matchAll(pattern)) {
    const token = match[0];
    if (!/^(?:\d+:[0-5]\d:[0-5]\d|\d+:[0-5]\d)$/.test(token)) continue;
    const seconds = token.split(':').reduce((total, part) => total * 60 + Number(part), 0);
    if (!Number.isSafeInteger(seconds)) continue;
    const index = match.index!;
    if (index > offset) segments.push({ type: 'text', text: text.slice(offset, index) });
    segments.push({ type: 'timestamp', text: token, seconds });
    offset = index + token.length;
  }
  if (offset < text.length) segments.push({ type: 'text', text: text.slice(offset) });
  return segments;
}

/** Append to the latest same-speaker turn within 1,500ms, even across overlapping speech. */
export function appendVoiceCaption(
  turns: readonly VoiceCaptionTurn[],
  speaker: VoiceSpeaker,
  delta: string,
  now: number,
): readonly VoiceCaptionTurn[] {
  if (!delta) return turns;
  for (let index = turns.length - 1; index >= 0; index--) {
    const turn = turns[index]!;
    if (turn.speaker !== speaker) continue;
    if (now - turn.updatedAt > 1500) break;
    const text = turn.text + delta;
    return turns.map((item, i) => i === index
      ? { ...turn, text, updatedAt: now, segments: splitVoiceTimestamps(text) }
      : item);
  }
  return [...turns, {
    id: `${speaker}-${now}-${turns.length}`,
    speaker, text: delta, startedAt: now, updatedAt: now,
    segments: splitVoiceTimestamps(delta),
  }];
}
