import { useEffect, useId, useRef, useState, type CSSProperties, type Ref } from "react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAssistant } from "./provider";
import { useAssistantSources, assistantSafeHref, type AssistantNavigation } from "./sources";
import { formatAssistantTime } from "./labels";
import { assistantChapterAt } from "./video";
import { remarkAssistantCitations } from "./markdown";
import type { ThreadMessage } from "../core";

export interface AssistantPanelProps extends AssistantNavigation {
  expandHref?: string;
  onClose?: () => void;
  inputRef?: Ref<HTMLTextAreaElement>;
  className?: string;
  style?: CSSProperties;
}

/** The answer renderer is also public for custom panels. */
export function AssistantAnswer({ message, ...navigation }: { message: ThreadMessage } & AssistantNavigation) {
  const { labels } = useAssistant();
  const { passages, sourceLink } = useAssistantSources(message, navigation);
  const videos = passages.filter((p, i) => passages.findIndex(other => other.videoId === p.videoId) === i).slice(0, 3);
  return <article className="bold-assistant-answer" data-answer={message.id}>
    {message.steps.length > 0 && <ul className="bold-assistant-progress" aria-live="polite">{message.steps.map((step, i) =>
      <li key={i} data-state={step.state}>{step.message ?? (step.found ? labels.found(step.found.passages, step.found.videos)
        : step.stage === "reading" ? labels.reading : step.stage === "searching" ? labels.searching
          : step.stage === "planning" ? labels.planning : step.stage === "synthesizing" ? labels.synthesizing : labels.working)}
        {step.message && step.found && <> · {labels.found(step.found.passages, step.found.videos)}</>}</li>)}</ul>}
    {message.scope?.widenedFrom === "focus" && <p className="bold-assistant-origin">{labels.widened}</p>}
    <ReactMarkdown remarkPlugins={[remarkGfm, remarkAssistantCitations]} components={{
      a: ({ href, children }) => {
        if (href?.startsWith("#bold-citation-")) {
          const id = href.slice("#bold-citation-".length);
          const link = sourceLink(id);
          if (!link.source) return <>{children}</>;
          const text = link.number ?? labels.document;
          const title = labels.source(link.number ?? 0, link.source.title ?? labels.thisVideo, formatAssistantTime(link.seconds));
          return link.href ? <a className="bold-assistant-citation" href={link.href} onClick={link.onClick} aria-label={title} data-citation={id}>{text}</a>
            : link.canSeek ? <button type="button" className="bold-assistant-citation" onClick={link.onClick} aria-label={title} data-citation={id}>{text}</button>
              : <span className="bold-assistant-citation" title={title}>{text}</span>;
        }
        return <a href={assistantSafeHref(href)} rel="noreferrer">{children}</a>;
      },
    }}>{message.content}</ReactMarkdown>
    {message.status === "complete" && message.scope && !message.scope.widenedFrom && message.scope.answeredFrom !== "none"
      && <p className="bold-assistant-meta">{message.scope.answeredFrom === "focus" ? labels.answeredVideo : labels.answeredLibrary}</p>}
    {videos.length > 0 && <div className="bold-assistant-sources" aria-label={labels.sources}>{videos.map(p => {
      const link = sourceLink(p.citationIds[0], true);
      const body = <><span>{p.number}</span><span>{p.title ?? labels.thisVideo}<small>{formatAssistantTime(p.start)}–{formatAssistantTime(p.end)}</small></span></>;
      return link.href ? <a key={p.videoId} href={link.href} onClick={link.onClick} data-source={p.number}>{body}</a>
        : <button type="button" key={p.videoId} disabled={!link.canSeek} onClick={link.onClick} data-source={p.number}>{body}</button>;
    })}</div>}
    {message.error && <p role="alert">{message.error.message}</p>}
    {message.status === "stopped" && <p className="bold-assistant-meta">{labels.stopped}</p>}
  </article>;
}

export function AssistantPanelContent({ expandHref, onClose, inputRef, className = "", style, ...navigation }: AssistantPanelProps) {
  const assistant = useAssistant();
  const { labels, video, switching, setAside, messages, isStreaming } = assistant;
  const [draft, setDraft] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const scroll = useRef<HTMLDivElement>(null);
  const atBottom = useRef(true);
  const questionId = useId();
  const visible = setAside ? [] : messages;
  useEffect(() => {
    if (atBottom.current && scroll.current) scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [messages, setAside, showHistory]);
  const moment = video?.moment;
  const at = moment?.kind === "paused" ? moment.at : moment?.from;
  const chapter = at === undefined ? "" : assistantChapterAt(video?.chapters, at);
  return <section className={`bold-assistant bold-assistant-panel ${className}`} style={{ ...assistant.style, ...style }}
    aria-label={assistant.name} data-place={video ? "video" : "library"} data-switching={switching || undefined} data-set-aside={setAside || undefined}>
    <header>
      <span className="bold-assistant-avatar">{assistant.avatar ? <img src={assistant.avatar} alt="" /> : assistant.name.charAt(0)}</span>
      <strong>{assistant.name}</strong>
      <nav>
        {assistant.hasHistory && <button type="button" aria-label={showHistory ? labels.back : labels.history} title={showHistory ? labels.back : labels.history}
          onClick={() => { setShowHistory(!showHistory); if (!showHistory) void assistant.listHistory(); }}>{showHistory ? "←" : "↶"}</button>}
        {!setAside && <button type="button" aria-label={labels.newQuestion} title={labels.newQuestion} onClick={() => { assistant.startNew(); setShowHistory(false); }}>＋</button>}
        {expandHref && <a href={assistantSafeHref(expandHref)} aria-label={labels.expand} title={labels.expand}>↗</a>}
        {onClose && <button type="button" aria-label={labels.close} title={labels.close} onClick={onClose}>×</button>}
      </nav>
    </header>
    <div className="bold-assistant-scroll" ref={scroll} onScroll={() => {
      const el = scroll.current!; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 60;
    }}>
      {showHistory ? <div className="bold-assistant-history">
        <h2>{labels.history}</h2>
        {assistant.historyLoading && <p role="status">{labels.loadingHistory}</p>}
        {!assistant.historyLoading && !assistant.history.length && !assistant.historyError && <p>{labels.emptyHistory}</p>}
        {assistant.history.map(item => <button type="button" key={item.conversationId} disabled={assistant.historyLoading}
          onClick={() => void assistant.open(item.conversationId).then(ok => { if (ok) setShowHistory(false); })}>
          <strong>{item.title ?? item.preview ?? labels.untitledConversation}</strong>
          <small>{item.video?.title ?? labels.library} · <time dateTime={item.updatedAt}>{item.updatedAt.slice(0, 10)}</time></small>
        </button>)}
        {assistant.historyHasMore && <button type="button" disabled={assistant.historyLoading} onClick={() => void assistant.listHistory(true)}>{labels.moreHistory}</button>}
      </div> : <>
        <div className="bold-assistant-top" data-top-block>
          {video ? <><small>{labels.thisVideo}</small><h2>{video.title ?? labels.thisVideo}</h2>
            <div className="bold-assistant-tools">
              <button type="button" disabled={switching || isStreaming} onClick={() => void assistant.ask(labels.keyPointsPrompt)}>{labels.keyPoints}</button>
              <button type="button" disabled={switching || isStreaming} onClick={() => void assistant.ask(labels.quizPrompt)}>{labels.quiz}</button>
            </div>
            {!visible.length && video.conversationStarters?.slice(0, 3).map((starter, i) => <button className="bold-assistant-starter" type="button" key={i}
              disabled={switching || isStreaming} onClick={() => void assistant.ask(starter)}>{starter}</button>)}
            {moment && <button className="bold-assistant-starter" type="button" data-moment={moment.kind} disabled={switching || isStreaming}
              onClick={() => void assistant.ask(moment.kind === "paused" ? labels.explainPrompt(formatAssistantTime(moment.at), chapter)
                : labels.relistenPrompt(formatAssistantTime(moment.from), formatAssistantTime(moment.to)))}>
              {moment.kind === "paused" ? labels.explain : labels.relisten} · {moment.kind === "paused" ? formatAssistantTime(moment.at)
                : `${formatAssistantTime(moment.from)}–${formatAssistantTime(moment.to)}`}{chapter && ` · ${chapter}`}
            </button>}
          </> : !visible.length && <h2>{assistant.greeting}</h2>}
        </div>
        {setAside && <div className="bold-assistant-aside"><span>{labels.lastConversation}<small>{messages.filter(m => m.role === "user").at(-1)?.content}</small></span>
          <button type="button" onClick={assistant.continueConversation}>{labels.continue}</button></div>}
        <div data-thread={visible.length > 0 || undefined}>{visible.map(message => message.role === "user"
          ? <p className="bold-assistant-question" key={message.id}>{message.content}</p>
          : <AssistantAnswer key={message.id} message={message} {...navigation} />)}</div>
        {!setAside && assistant.canRetry && <button type="button" disabled={switching} onClick={() => void assistant.retry()}>{labels.retry}</button>}
      </>}
      {assistant.historyError && <p role="alert">{assistant.historyError}</p>}
    </div>
    <form onSubmit={event => { event.preventDefault(); if (!draft.trim() || switching || isStreaming) return; void assistant.ask(draft); setDraft(""); setShowHistory(false); }}>
      <p className="bold-assistant-scope" data-scope>{video ? labels.lookingAtVideo : labels.lookingAtLibrary}</p>
      <label className="bold-assistant-sr" htmlFor={questionId}>{labels.question}</label>
      <div className="bold-assistant-compose"><textarea id={questionId} ref={inputRef} value={draft} rows={2} placeholder={labels.placeholder}
        onChange={event => setDraft(event.target.value)} onKeyDown={event => {
          if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); event.currentTarget.form?.requestSubmit(); }
        }} />
        {isStreaming ? <button type="button" onClick={assistant.stop}>{labels.stop}</button>
          : <button type="submit" disabled={!draft.trim() || switching}>{labels.send}</button>}
      </div>
      <small className="bold-assistant-disclaimer">{labels.disclaimer}</small>
    </form>
  </section>;
}
