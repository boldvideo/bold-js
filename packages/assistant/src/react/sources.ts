import { useContext, useMemo, type MouseEvent } from "react";
import { buildPassages, citationPlayStart, type ThreadMessage } from "../core";
import { ConversationContext, useAssistant } from "./provider";

export interface AssistantNavigation {
  navigate?: (href: string) => void;
  videoHref?: (videoId: string, seconds: number) => string;
}

/** Reject active-content URLs, including whitespace-obfuscated protocols. */
export function assistantSafeHref(href: string | null | undefined): string | undefined {
  if (!href) return undefined;
  const value = href.trim();
  return /^(https?:|mailto:)/i.test(value) || (!/[:\\\u0000-\u0020]/.test(value) && !value.startsWith("//")) ? value : undefined;
}

/** Resolved passages and anchor props for chips/rows, including same-page seeking. */
export function useAssistantSources(message: ThreadMessage, navigation: AssistantNavigation = {}) {
  const { video, switching } = useAssistant();
  const { follow } = useContext(ConversationContext)!;
  const result = useMemo(() => buildPassages(message.content, message), [message]);
  function sourceLink(id: string, wholePassage = false) {
    const source = result.citationsById.get(id);
    const number = result.passageNumberByCitationId.get(id);
    const passage = result.passages.find(p => p.number === number);
    const seconds = passage ? citationPlayStart(passage, wholePassage ? null : { id, timestamp: source?.timestamp ?? null }) : 0;
    const videoId = passage?.videoId;
    const target = wholePassage && passage ? passage.source : source;
    let href = (videoId ? navigation.videoHref?.(videoId, seconds) : undefined)
      ?? target?.timestampUrl ?? target?.canonicalUrl ?? (target && "url" in target ? target.url : undefined);
    href = assistantSafeHref(href);
    if (href && message.interactionId) {
      const hashAt = href.indexOf("#");
      const hash = hashAt >= 0 ? href.slice(hashAt) : "";
      const path = hashAt >= 0 ? href.slice(0, hashAt) : href;
      href = `${path}${path.includes("?") ? "&" : "?"}interactionId=${encodeURIComponent(message.interactionId)}${hash}`;
    }
    const canSeek = !!videoId && !switching && !!video?.onSeek && (video.videoId === videoId || video.canonicalVideoId === videoId);
    return { href, number, seconds, source, passage, canSeek,
      onClick(event: MouseEvent<HTMLElement>) {
        if (event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey || event.defaultPrevented) return;
        if (!canSeek && !href) return;
        if (source?.videoId) follow(message.interactionId ?? message.id, source.videoId);
        if (canSeek) { event.preventDefault(); video!.onSeek!(seconds, message.interactionId); }
        else if (href && navigation.navigate) { event.preventDefault(); navigation.navigate(href); }
      },
    };
  }
  return { ...result, sourceLink };
}
