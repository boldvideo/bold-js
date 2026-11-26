import type { AssistantSource, CitationSource } from "./types";

/** Seconds between cited sentences, measured end to start. */
export const DEFAULT_PASSAGE_GAP_SECONDS = 45;
export interface Passage {
  number: number;
  videoId: string;
  title: string | null;
  start: number;
  end: number;
  excerpt: string;
  citationIds: string[];
  source: AssistantSource;
}
export interface AnswerCitations {
  citationMap?: Readonly<Record<string, CitationSource>>;
  sources?: readonly AssistantSource[];
  /** Stable citation IDs to zero-based indices in sources, from the answer event. */
  citationIndices?: Readonly<Record<string, number>>;
}
export interface PassageResult {
  passages: Passage[];
  /** Includes non-playable documents so a renderer can still link them. */
  citationsById: Map<string, AssistantSource>;
  passageNumberByCitationId: Map<string, number>;
}

/** Only cited tokens participate. No input arrays or maps are mutated. All times are seconds. */
export function buildPassages(content: string, citations: AnswerCitations, options: { gapSeconds?: number } = {}): PassageResult {
  const gap = options.gapSeconds ?? DEFAULT_PASSAGE_GAP_SECONDS;
  const references = [...content.matchAll(/\[((?:c_[\w-]+|\d+)(?:[\s,]+(?:c_[\w-]+|\d+))*)\]/g)]
    .flatMap(match => match[1].split(/[\s,]+/));
  const ids = [...new Set(references)];
  const reserved = new Set(ids.filter(id => /^\d+$/.test(id)).map(Number));
  const citationsById = new Map<string, AssistantSource>();
  const playable: { id: string; source: AssistantSource; start: number; end: number; order: number; literal: boolean }[] = [];
  ids.forEach((id, order) => {
    const literal = /^\d+$/.test(id);
    const position = literal ? Number(id) - 1 : citations.citationIndices?.[id];
    const source = citations.citationMap?.[id]
      ?? (position !== undefined ? citations.sources?.[position] : citations.sources?.find(source => "id" in source && source.id === id));
    // Retrieval-time cited flags predate synthesis; the text itself proves use.
    if (!source) return;
    citationsById.set(id, source);
    if (!source.videoId || source.timestamp === null || !Number.isFinite(source.timestamp)) return;
    const end = "timestampEnd" in source ? source.timestampEnd : null;
    playable.push({ id, source, literal, start: Math.max(0, source.timestamp),
      end: Math.max(0, source.timestamp, end ?? source.timestamp), order });
  });

  // Sorting by time before merging also joins two groups bridged by a later citation.
  // Literal references stay separate and cannot interrupt a stable-ID group.
  const sorted = [...playable].sort((a, b) => Number(a.literal) - Number(b.literal)
    || a.source.videoId!.localeCompare(b.source.videoId!) || a.start - b.start);
  const groups: { items: typeof playable; end: number; order: number }[] = [];
  for (const item of sorted) {
    const last = groups[groups.length - 1];
    if (!item.literal && last && last.items[0].source.videoId === item.source.videoId && item.start <= last.end + gap) {
      last.items.push(item);
      last.end = Math.max(last.end, item.end);
      last.order = Math.min(last.order, item.order);
    } else groups.push({ items: [item], end: item.end, order: item.order });
  }
  const passageNumberByCitationId = new Map<string, number>();
  let nextNumber = 1;
  const passages = groups.sort((a, b) => a.order - b.order).map((group): Passage => {
    const first = group.items[0];
    while (reserved.has(nextNumber)) nextNumber++;
    const number = first.literal ? Number(first.id) : nextNumber++;
    let excerpt = "";
    let lastEnd: number | undefined;
    const seen = new Set<string>();
    for (const item of group.items) {
      passageNumberByCitationId.set(item.id, number);
      const text = "text" in item.source ? item.source.text.replace(/\s+/g, " ").trim() : "";
      if (!text || seen.has(text)) continue;
      seen.add(text);
      excerpt += excerpt ? `${item.start - lastEnd! > 3 ? " … " : " "}${text}` : text;
      lastEnd = item.end;
    }
    return { number, videoId: first.source.videoId!, title: first.source.title ?? null,
      start: first.start, end: group.end, excerpt, source: first.source,
      citationIds: [...group.items].sort((a, b) => a.order - b.order).map(item => item.id) };
  });
  return { passages, citationsById, passageNumberByCitationId };
}

/** A chip starts at its sentence with one second of lead-in; a row starts at the passage. */
export function citationPlayStart(passage: Passage, selected?: { id: string; timestamp: number | null } | null): number {
  if (!selected || !passage.citationIds.includes(selected.id) || selected.timestamp === null) return passage.start;
  return Math.max(passage.start, selected.timestamp - 1);
}
