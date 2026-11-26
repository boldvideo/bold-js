import type { ThreadMessage } from "./thread";

export type Place = "library" | `video:${string}`;

/**
 * Keep continuedAt equal to the current place while streaming, and retain it
 * after completion. Reset it when replacing the thread. This keeps an answer
 * visible if the viewer navigates while it is being written.
 */
export function shouldSetAside({ messages, place, followedAnswerId, continuedAt, streaming, canonicalVideoId }: {
  messages: readonly ThreadMessage[];
  place: Place;
  followedAnswerId?: string | null;
  continuedAt?: Place | null;
  streaming: boolean;
  canonicalVideoId?: string | null;
}): boolean {
  const questionIndex = messages.map(message => message.role).lastIndexOf("user");
  if (questionIndex < 0 || streaming || continuedAt === place) return false;
  const question = messages[questionIndex];
  const answer = messages[questionIndex + 1];
  const videoId = answer?.scope?.focus?.videoId ?? question.focus?.videoId;
  const askedAt: Place = videoId ? `video:${videoId}` : "library";
  if (askedAt === place || (place !== "library" && videoId && videoId === canonicalVideoId)) return false;
  return !followedAnswerId || !messages.some(message => message.role === "assistant" && message.interactionId === followedAnswerId);
}
