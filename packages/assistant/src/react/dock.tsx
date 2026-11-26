import { lazy, Suspense, useCallback, useEffect, useId, useRef, useState } from "react";
import { useAssistant } from "./provider";
import type { AssistantPanelProps } from "./panel";
import type { ThreadMessage } from "../core";
import type { AssistantNavigation } from "./sources";

export function preloadAssistantPanel() { return import("./panel"); }
const Panel = lazy(() => preloadAssistantPanel().then(module => ({ default: module.AssistantPanelContent })));
const Answer = lazy(() => preloadAssistantPanel().then(module => ({ default: module.AssistantAnswer })));

export function AssistantPanel(props: AssistantPanelProps) {
  const { labels } = useAssistant();
  return <Suspense fallback={<div className="bold-assistant" role="status">{labels.loading}</div>}><Panel {...props} /></Suspense>;
}
export function AssistantAnswer(props: { message: ThreadMessage } & AssistantNavigation) {
  return <Suspense fallback={null}><Answer {...props} /></Suspense>;
}
export interface AssistantDockProps extends AssistantNavigation {
  hidden?: boolean;
  expandHref?: string;
}

export function AssistantDock({ hidden = false, ...props }: AssistantDockProps) {
  const { labels, name, avatar, style, video, switching, setAside } = useAssistant();
  const [open, setOpen] = useState(false);
  const [shown, setShown] = useState(false);
  const openRef = useRef(open);
  openRef.current = open;
  const wasOpen = useRef(false);
  const button = useRef<HTMLButtonElement>(null);
  const shell = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLTextAreaElement | null>(null);
  const id = useId();
  const focusInput = useCallback((node: HTMLTextAreaElement | null) => {
    input.current = node;
    if (node && openRef.current) node.focus();
  }, []);
  const change = useCallback((next: boolean) => {
    setOpen(next);
    if (next) setShown(true);
    try { sessionStorage.setItem("bold-assistant:dock", next ? "open" : "closed"); } catch { /* Optional persistence. */ }
  }, []);
  useEffect(() => {
    try {
      if (sessionStorage.getItem("bold-assistant:dock") === "open") { setOpen(true); setShown(true); }
    } catch { /* Closed by default when storage is blocked. */ }
    const preload = () => { void preloadAssistantPanel().catch(() => {}); };
    if (typeof window.requestIdleCallback === "function") {
      const idle = window.requestIdleCallback(preload);
      return () => window.cancelIdleCallback(idle);
    }
    const timer = setTimeout(preload, 800);
    return () => clearTimeout(timer);
  }, []);
  useEffect(() => {
    shell.current?.toggleAttribute("inert", !open || hidden);
    if (open && !hidden) input.current?.focus();
    if (!open && wasOpen.current && !hidden) button.current?.focus();
    wasOpen.current = open;
  }, [open, hidden]);
  useEffect(() => {
    if (hidden) return;
    const keydown = (event: KeyboardEvent) => {
      const target = event.target;
      if (event.defaultPrevented || event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
      if (event.key === "/" && !(target instanceof HTMLElement && (target.isContentEditable || target.closest("input, textarea, select")))) {
        event.preventDefault(); change(true); input.current?.focus();
      } else if (event.key === "Escape" && shell.current?.contains(target as Node)) {
        event.preventDefault(); change(false);
      }
    };
    document.addEventListener("keydown", keydown);
    return () => document.removeEventListener("keydown", keydown);
  }, [hidden, change]);
  return <div className="bold-assistant bold-assistant-dock" style={style} hidden={hidden}
    data-state={open ? "open" : "closed"} data-place={video ? "video" : "library"}
    data-switching={switching || undefined} data-set-aside={setAside || undefined}>
    <div className="bold-assistant-shell" id={id} ref={shell} aria-hidden={!open || hidden}>
      {shown && <AssistantPanel {...props} inputRef={focusInput} onClose={() => change(false)} />}
    </div>
    <button type="button" ref={button} className="bold-assistant-launcher" aria-label={open ? labels.close : labels.open}
      aria-expanded={open} aria-controls={id} onClick={() => change(!open)}
      onMouseEnter={() => void preloadAssistantPanel().catch(() => {})} onFocus={() => void preloadAssistantPanel().catch(() => {})}>
      <span className="bold-assistant-avatar">{avatar ? <img src={avatar} alt="" /> : name.charAt(0)}</span><span>{name}</span>
    </button>
  </div>;
}
