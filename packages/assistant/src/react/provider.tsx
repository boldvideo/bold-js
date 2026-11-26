import {
  createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore,
  type CSSProperties, type ReactNode,
} from "react";
import {
  createFetchTransport, createVideoStore, emptyThread, reduceThread, shouldSetAside,
  type AskRequest, type AssistantError, type AssistantTransport, type ConversationSummary,
  type Place, type Thread, type ThreadEvent, type VideoSnapshot,
} from "../core";
import { defaultAssistantLabels, type AssistantLabels } from "./labels";

export interface AssistantSettings {
  aiName?: string | null;
  aiAvatar?: string | null;
  aiGreeting?: string | null;
  account?: { ai?: { name?: string | null; avatarUrl?: string | null; avatar_url?: string | null; greeting?: string | null } | null } | null;
  themeConfig?: { light?: { accent?: string | null } | null; dark?: { accent?: string | null } | null } | null;
}
export type AssistantProviderProps = {
  children: ReactNode;
  viewerKey: string;
  settings?: AssistantSettings;
  labels?: Partial<AssistantLabels>;
} & ({ endpoint: string; transport?: never } | { transport: AssistantTransport; endpoint?: never });

const emptyVideo: VideoSnapshot = { video: null, switching: false };
const VideoContext = createContext<ReturnType<typeof createVideoStore> | null>(null);

type Followed = { answerId: string; videoId: string } | null;
interface ConversationValue extends Thread {
  labels: AssistantLabels;
  name: string;
  avatar: string | null;
  greeting: string;
  style: CSSProperties;
  ask(prompt: string, options?: { fresh?: boolean }): Promise<void>;
  retry(): Promise<void>;
  stop(): void;
  startNew(): void;
  open(id: string): Promise<boolean>;
  canRetry: boolean;
  hasHistory: boolean;
  history: ConversationSummary[];
  historyLoading: boolean;
  historyError: string | null;
  historyHasMore: boolean;
  listHistory(more?: boolean): Promise<void>;
  continuedAt: Place | null;
  continueHere(place: Place): void;
  followed: Followed;
  follow(answerId: string, videoId: string): void;
}
const ConversationContext = createContext<ConversationValue | null>(null);

/** Identity changes remount the conversation before children can see the old viewer's state. */
export function AssistantProvider(props: AssistantProviderProps) {
  return <ProviderSession key={JSON.stringify([props.viewerKey, props.endpoint])} {...props} />;
}

function ProviderSession({ children, viewerKey, endpoint, transport: supplied, settings, labels: overrides }: AssistantProviderProps) {
  const transport = useMemo(() => supplied ?? createFetchTransport(endpoint!), [supplied, endpoint]);
  const [store] = useState(createVideoStore);
  const [thread, setThread] = useState(emptyThread);
  const current = useRef(thread);
  const generation = useRef(0);
  const listGeneration = useRef(0);
  const abort = useRef<AbortController | null>(null);
  const lastRequest = useRef<AskRequest | null>(null);
  const touched = useRef(false);
  const [continuedAt, setContinuedAt] = useState<Place | null>(null);
  const continued = useRef<Place | null>(null);
  const continuingNavigation = useRef(false);
  const [followed, setFollowed] = useState<Followed>(null);
  const [history, setHistory] = useState<ConversationSummary[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [listing, setListing] = useState(false);
  const [listError, setListError] = useState<string | null>(null);
  const [historyHasMore, setHistoryHasMore] = useState(false);
  const offset = useRef(0);
  const labels = useMemo(() => ({ ...defaultAssistantLabels, ...overrides }), [overrides]);
  const key = `bold-assistant:thread:${JSON.stringify([endpoint ?? "transport", viewerKey])}`;
  const hasHistory = !!(transport.list && transport.load);

  function save(id?: string) {
    try {
      if (id) sessionStorage.setItem(key, JSON.stringify({ id, at: Date.now() }));
      else sessionStorage.removeItem(key);
    } catch { /* Storage may be disabled. The in-memory conversation still works. */ }
  }
  function dispatch(event: ThreadEvent) {
    current.current = reduceThread(current.current, event);
    setThread(current.current);
  }
  function invalidate() {
    generation.current++;
    listGeneration.current++;
    setListing(false);
    setListError(null);
    abort.current?.abort();
    abort.current = null;
    setHistoryLoading(false);
  }
  function continueHere(place: Place) {
    continued.current = place;
    setContinuedAt(place);
  }
  function clearPlace() {
    continued.current = null;
    continuingNavigation.current = false;
    setContinuedAt(null);
    setFollowed(null);
  }
  function placeNow(): Place {
    const video = store.getSnapshot().video;
    return video ? `video:${video.videoId}` : "library";
  }
  function isAside() {
    const video = store.getSnapshot().video;
    return shouldSetAside({ messages: current.current.messages, streaming: current.current.isStreaming,
      place: placeNow(), continuedAt: continued.current, canonicalVideoId: video?.canonicalVideoId,
      followedAnswerId: video && followed && (followed.videoId === video.videoId
        || followed.videoId === video.canonicalVideoId) ? followed.answerId : null });
  }
  function stop() {
    const requestId = current.current.activeRequestId;
    invalidate();
    if (requestId) dispatch({ type: "viewer_stopped", requestId });
  }
  function startNew() {
    touched.current = true;
    invalidate();
    lastRequest.current = null;
    clearPlace();
    dispatch({ type: "thread_reset" });
    save();
    setHistoryError(null);
  }
  async function run(request: AskRequest, fresh = false, retry = false) {
    if (retry && reduceThread(current.current, { type: "question_asked", request, retry }) === current.current) return;
    touched.current = true;
    invalidate();
    const attempt = generation.current;
    const controller = new AbortController();
    abort.current = controller;
    lastRequest.current = request;
    if (fresh) { clearPlace(); save(); }
    continueHere(placeNow());
    setHistoryError(null);
    dispatch({ type: "question_asked", request, fresh, retry });
    try {
      for await (const event of transport.ask(request, { signal: controller.signal })) {
        if (attempt !== generation.current) break;
        dispatch({ type: "event_received", requestId: request.requestId, event });
        if (event.type === "message_complete") save(current.current.conversationId);
        if (event.type === "message_complete" || event.type === "error") break;
      }
    } catch (error) {
      if (attempt === generation.current && !controller.signal.aborted) {
        const typed = error as Partial<AssistantError> | null;
        dispatch({ type: "event_received", requestId: request.requestId, event: {
          type: "error", code: typeof typed?.code === "string" ? typed.code : "transport_error",
          message: typed?.type === "error" && typeof typed.message === "string" ? typed.message : labels.failed,
          retryable: typeof typed?.retryable === "boolean" ? typed.retryable : true,
        } });
      }
    } finally {
      if (attempt === generation.current) {
        dispatch({ type: "stream_ended", requestId: request.requestId });
        abort.current = null;
      }
    }
  }
  async function ask(prompt: string, options: { fresh?: boolean } = {}) {
    if (!prompt.trim()) return;
    const { video, switching } = store.getSnapshot();
    if (switching) return;
    const fresh = options.fresh ?? isAside();
    const time = video?.getCurrentTime?.() ?? video?.currentTime;
    await run({ prompt: prompt.trim(), requestId: crypto.randomUUID(),
      conversationId: fresh ? undefined : current.current.conversationId,
      focus: video ? { videoId: video.canonicalVideoId ?? video.videoId,
        ...(time !== undefined && Number.isFinite(time) && time >= 0 ? { currentTime: time } : {}) } : undefined,
    }, fresh);
  }
  const last = thread.messages.at(-1);
  const canRetry = !!lastRequest.current && !thread.isStreaming
    && (last?.status === "stopped" || (last?.status === "error" && !!last.error?.retryable));
  async function retry() {
    if (current.current.isStreaming || !lastRequest.current || store.getSnapshot().switching) return;
    // Replay the same request, including its original focus and conversation ID.
    await run(lastRequest.current, false, true);
  }
  async function open(id: string, restoring = false) {
    if (!hasHistory) return false;
    if (!restoring) touched.current = true;
    stop();
    const attempt = generation.current;
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const conversation = await transport.load!(id);
      if (attempt !== generation.current) return false;
      clearPlace();
      continueHere(placeNow());
      lastRequest.current = null;
      dispatch({ type: "conversation_loaded", conversation });
      save(id);
      return true;
    } catch (error) {
      if (attempt === generation.current) {
        const typed = error as Partial<AssistantError> & { status?: number };
        setHistoryError(typed?.type === "error" ? typed.message ?? labels.historyFailed : labels.historyFailed);
        if (typed?.status === 403 || typed?.status === 404) save();
      }
      return false;
    } finally { if (attempt === generation.current) setHistoryLoading(false); }
  }
  async function listHistory(more = false) {
    if (!hasHistory) return;
    const attempt = ++listGeneration.current;
    setListing(true);
    setListError(null);
    try {
      const page = await transport.list!({ offset: more ? offset.current : 0 });
      if (attempt !== listGeneration.current) return;
      setHistory(previous => more ? [...previous, ...page.conversations] : page.conversations);
      offset.current = (more ? offset.current : 0) + page.conversations.length;
      setHistoryHasMore(page.pagination.hasMore && page.conversations.length > 0);
    } catch (error) {
      if (attempt === listGeneration.current) {
        const typed = error as Partial<AssistantError>;
        setListError(typed?.type === "error" ? typed.message ?? labels.historyFailed : labels.historyFailed);
      }
    } finally { if (attempt === listGeneration.current) setListing(false); }
  }

  useEffect(() => {
    // Subscribe above the lazy panel: a stream may finish while the dock is closed.
    const unsubscribe = store.subscribe(() => {
      if (store.getSnapshot().switching) {
        continuingNavigation.current ||= current.current.isStreaming;
      } else if (current.current.isStreaming || continuingNavigation.current) {
        continuingNavigation.current = false;
        continueHere(placeNow());
      }
    });
    if (hasHistory && !touched.current) {
      try {
        const stored = JSON.parse(sessionStorage.getItem(key) ?? "null");
        if (typeof stored?.id === "string" && typeof stored.at === "number"
          && Date.now() - stored.at < 12 * 60 * 60 * 1000) void open(stored.id, true);
      } catch { /* Invalid or blocked storage starts empty. */ }
    }
    return () => {
      stop();
      listGeneration.current++;
      unsubscribe();
      // Child cleanup can release a video after parent cleanup. Dispose after it.
      queueMicrotask(() => { if (!mounted.current) store.dispose(); });
    };
  }, [store]);
  const mounted = useRef(false);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);

  const ai = settings?.account?.ai;
  const value: ConversationValue = {
    ...thread, labels, name: ai?.name ?? settings?.aiName ?? labels.name,
    avatar: ai?.avatarUrl ?? ai?.avatar_url ?? settings?.aiAvatar ?? null,
    greeting: ai?.greeting ?? settings?.aiGreeting ?? labels.greeting,
    style: {
      ...(settings?.themeConfig?.light?.accent ? { "--bold-assistant-accent-light": settings.themeConfig.light.accent } : {}),
      ...(settings?.themeConfig?.dark?.accent ? { "--bold-assistant-accent-dark": settings.themeConfig.dark.accent } : {}),
    } as CSSProperties,
    ask, retry, stop, startNew, open, canRetry, hasHistory, history, historyLoading: historyLoading || listing,
    historyError: historyError ?? listError, historyHasMore, listHistory, continuedAt, continueHere, followed,
    follow: (answerId, videoId) => setFollowed({ answerId, videoId }),
  };
  return <VideoContext.Provider value={store}><ConversationContext.Provider value={value}>
    {children}
  </ConversationContext.Provider></VideoContext.Provider>;
}

/** Thread, history, presentation settings and the current page. No private panel state. */
export function useAssistant() {
  const value = useContext(ConversationContext);
  const store = useContext(VideoContext);
  if (!value || !store) throw new Error("Use AssistantProvider above assistant components.");
  const snapshot = useSyncExternalStore(store.subscribe, store.getSnapshot, () => emptyVideo);
  const place: Place = snapshot.video ? `video:${snapshot.video.videoId}` : "library";
  const setAside = shouldSetAside({ messages: value.messages, place, streaming: value.isStreaming,
    continuedAt: value.continuedAt, canonicalVideoId: snapshot.video?.canonicalVideoId,
    followedAnswerId: value.followed && (snapshot.video?.videoId === value.followed.videoId
      || snapshot.video?.canonicalVideoId === value.followed.videoId) ? value.followed.answerId : null });
  return { ...value, ...snapshot, place, setAside, continueConversation: () => value.continueHere(place) };
}

// Registration is kept separate from the changing conversation context.
export { VideoContext };
