import type { AIConfig } from './ai';
import type { VoiceCaptionTurn, VoiceEndReason, VoicePlaybackState, VoiceSession, VoiceSessionOptions, VoiceStatus } from './types';
import { appendVoiceCaption } from './voice-captions';

/** Broker HTTP or network failure. Session creation is never automatically retried. */
export class VoiceAPIError extends Error {
  readonly status?: number;
  readonly code?: string;
  readonly retryable?: boolean;
  readonly resetsOn?: string;
  readonly retryAfter?: string;
  readonly originalError?: Error;

  constructor(response?: Response, body?: Record<string, unknown>, error?: unknown) {
    super(typeof body?.message === 'string' ? body.message
      : typeof body?.error === 'string' ? body.error
      : response ? `Voice session request failed (HTTP ${response.status})`
      : error instanceof Error ? error.message : 'Voice session request failed');
    this.name = 'VoiceAPIError';
    this.status = response?.status;
    this.code = typeof body?.code === 'string' ? body.code : undefined;
    this.retryable = typeof body?.retryable === 'boolean' ? body.retryable : undefined;
    this.resetsOn = typeof body?.resets_on === 'string' ? body.resets_on : undefined;
    this.retryAfter = response?.headers.get('retry-after') ?? undefined;
    this.originalError = error instanceof Error ? error : undefined;
  }
}

function waitForIce(pc: RTCPeerConnection, signal: AbortSignal): Promise<void> {
  if (signal.aborted || pc.iceGatheringState === 'complete') return Promise.resolve();
  return new Promise(resolve => {
    const done = () => {
      clearTimeout(timer);
      pc.removeEventListener('icegatheringstatechange', check);
      signal.removeEventListener('abort', done);
      resolve();
    };
    const check = () => { if (pc.iceGatheringState === 'complete') done(); };
    const timer = setTimeout(done, 2500);
    pc.addEventListener('icegatheringstatechange', check);
    signal.addEventListener('abort', done, { once: true });
  });
}

export function createVoice(config: AIConfig) {
  return { createSession: (options: VoiceSessionOptions): VoiceSession => createSession(config, options) };
}

function createSession(config: AIConfig, options: VoiceSessionOptions): VoiceSession {
  if (typeof options.videoId !== 'string' || !options.videoId.trim()) {
    throw new TypeError('videoId is required');
  }
  // Capture configuration now, but do not touch browser globals until start().
  const { videoId, viewer, viewerProfile, ...callbacks } = options;
  let status: VoiceStatus = 'idle';
  let sessionId: string | null = null;
  let muted = false;
  let playback: VoicePlaybackState | null = null;
  let disposed = false;
  let pc: RTCPeerConnection | null = null;
  let dc: RTCDataChannel | null = null;
  let stream: MediaStream | null = null;
  let audio: HTMLAudioElement | null = null;
  let context: AudioContext | null = null;
  let inputAnalyser: AnalyserNode | null = null;
  let outputAnalyser: AnalyserNode | null = null;
  const samples = new Uint8Array(512);
  let abort: AbortController | null = null;
  let startup: Promise<void> | null = null;
  let resolveStart: (() => void) | undefined;
  let rejectStart: ((error: Error) => void) | undefined;
  let ending: Promise<void> | null = null;
  let resolveEnd: (() => void) | undefined;
  let endReason: VoiceEndReason = 'user';
  let watchdog: ReturnType<typeof setTimeout> | undefined;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  let tick: ReturnType<typeof setInterval> | undefined;
  let startedAt = 0;
  let lastActivity = 0;
  let maxSeconds = 0;
  let idleSeconds = 0;
  let turns: readonly VoiceCaptionTurn[] = [];

  function notify<T>(callback: ((value: T) => void) | undefined, value: T) {
    if (disposed) return;
    try { callback?.(value); } catch {
      // A consumer callback must never prevent microphone cleanup or promise settlement.
      console.error('[bold-js] Voice callback failed');
    }
  }

  function send(event: Record<string, unknown>) {
    try { if (dc?.readyState === 'open') dc.send(JSON.stringify(event)); } catch {
      // Transport may close between checking readyState and sending.
    }
  }

  function stopMedia() {
    clearTimeout(watchdog);
    clearInterval(tick);
    abort?.abort();
    for (const track of stream?.getTracks() ?? []) track.stop();
    stream = null;
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio = null;
    }
    void context?.close().catch(() => {});
    context = null;
    inputAnalyser = outputAnalyser = null;
  }

  function applyPlayback() {
    for (const track of stream?.getAudioTracks() ?? []) track.enabled = !muted && !playback?.playing;
    if (audio) audio.muted = playback?.playing ?? false;
  }

  function sendPlayback() {
    if (!playback || status !== 'live') return;
    const seconds = playback.currentTime;
    const minutes = Math.floor(seconds / 60);
    const timestamp = minutes < 60
      ? `${minutes}:${String(seconds % 60).padStart(2, '0')}`
      : `${Math.floor(minutes / 60)}:${String(minutes % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
    send({
      type: 'session.thinking.append', delegation_id: null,
      content: playback.playing
        ? `The viewer is playing the video at ${timestamp}. They cannot hear you while it plays; stay quiet until they pause it.`
        : `The viewer paused the video at ${timestamp}.`,
    });
  }

  function finish(reason: VoiceEndReason) {
    if (status === 'ended') return;
    status = 'ended';
    stopMedia();
    clearTimeout(closeTimer);
    if (typeof window !== 'undefined') window.removeEventListener('pagehide', dispose);
    if (dc) {
      dc.onmessage = dc.onclose = dc.onerror = null;
      dc.close();
      dc = null;
    }
    if (pc) {
      pc.ontrack = pc.onconnectionstatechange = null;
      pc.close();
      pc = null;
    }
    resolveStart?.();
    resolveEnd?.();
    notify(callbacks.onStatus, status);
    notify(callbacks.onEnded, reason);
  }

  function fail(value: unknown) {
    if (status !== 'connecting' && status !== 'live') return;
    const error = value instanceof Error ? value : new Error(String(value));
    rejectStart?.(error);
    console.error('[bold-js] Voice session failed', {
      name: error.name, status: error instanceof VoiceAPIError ? error.status : undefined,
    });
    void end('error');
    notify(callbacks.onError, error);
  }

  function end(reason: VoiceEndReason = 'user'): Promise<void> {
    if (ending) return ending;
    if (status === 'ended') return Promise.resolve();
    ending = new Promise(resolve => { resolveEnd = resolve; });
    endReason = reason;
    status = 'ending';
    stopMedia();
    resolveStart?.();
    // Install the timeout before send: a close acknowledgement can arrive immediately.
    closeTimer = setTimeout(() => finish(reason), 3000);
    const canClose = dc?.readyState === 'open';
    notify(callbacks.onStatus, status);
    if (status === 'ending') {
      send({ type: 'session.close' });
      if (!canClose) finish(reason);
    }
    return ending;
  }

  function dispose() {
    disposed = true;
    send({ type: 'session.close' });
    finish(endReason);
  }

  function analyse(media: MediaStream): AnalyserNode {
    const analyser = context!.createAnalyser();
    analyser.fftSize = samples.length;
    context!.createMediaStreamSource(media).connect(analyser);
    return analyser;
  }

  function level(analyser: AnalyserNode | null): number {
    if (!analyser) return 0;
    analyser.getByteTimeDomainData(samples);
    let sum = 0;
    for (const value of samples) sum += ((value - 128) / 128) ** 2;
    return Math.sqrt(sum / samples.length);
  }

  function checkLimits() {
    if (status !== 'connecting' && status !== 'live') return;
    const now = performance.now();
    if (now - startedAt >= maxSeconds * 1000) {
      const error = status === 'connecting' ? new Error('Voice session expired before connecting') : undefined;
      if (error) rejectStart?.(error);
      void end('time');
      if (error) notify(callbacks.onError, error);
    } else if (status === 'live') {
      if (playback?.playing || level(outputAnalyser) > 0.02 || (!muted && level(inputAnalyser) > 0.02)) lastActivity = now;
      if (now - lastActivity >= idleSeconds * 1000) void end('idle');
    }
  }

  function handleEvent(data: unknown) {
    if (status === 'ended') return;
    let event;
    try { event = JSON.parse(String(data)); } catch { return; }
    if (!event || typeof event !== 'object') return;
    if (event.type === 'session.closed') {
      const error = status === 'connecting' ? new Error('Voice session closed before connecting') : undefined;
      if (error) rejectStart?.(error);
      finish(status === 'ending' ? endReason : 'server');
      if (error) notify(callbacks.onError, error);
      return;
    }
    if (status !== 'connecting' && status !== 'live') return;
    if (event.type === 'session.started' && status === 'connecting') {
      checkLimits();
      if (status !== 'connecting') return;
      clearTimeout(watchdog);
      status = 'live';
      lastActivity = performance.now();
      sendPlayback();
      resolveStart?.();
      notify(callbacks.onStatus, status);
    } else if (event.type === 'session.input_transcript.delta' || event.type === 'session.output_transcript.delta') {
      if (typeof event.delta !== 'string' || !event.delta) return;
      lastActivity = performance.now();
      const speaker = event.type === 'session.input_transcript.delta' ? 'user' : 'assistant';
      turns = appendVoiceCaption(turns, speaker, event.delta, Date.now());
      notify(callbacks.onCaptions, turns);
    } else if (event.type === 'session.delegation.created') {
      send({
        type: 'session.commentary.append',
        delegation_id: typeof event.delegation?.id === 'string' ? event.delegation.id : null,
        content: 'Only this video transcript is available. Answer from it, or say the video does not cover it.',
      });
    } else if (event.type === 'error') {
      notify(callbacks.onError, new Error(typeof event.error?.message === 'string'
        ? event.error.message : 'Voice provider error'));
    }
  }

  async function connect(signal: AbortSignal) {
    const cancelled = () => signal.aborted || status !== 'connecting';
    try {
      if (typeof window === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
        throw new Error('Voice requires a browser with microphone access in a secure context');
      }
      const AudioContextClass = window.AudioContext
        ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      context = new AudioContextClass();
      // Resume in the user gesture, but do not let a suspended context block microphone cancellation.
      const resumed = context.resume();
      void resumed.catch(fail);
      window.addEventListener('pagehide', dispose);
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      if (cancelled()) {
        for (const track of media.getTracks()) track.stop();
        return;
      }
      stream = media;
      watchdog = setTimeout(() => fail(new Error('Voice connection timed out')), 60000);
      applyPlayback();
      await resumed;
      if (cancelled()) return;
      inputAnalyser = analyse(media);
      const peer = new RTCPeerConnection();
      pc = peer;
      audio = new Audio();
      audio.autoplay = true;
      applyPlayback();
      peer.ontrack = event => {
        if (status !== 'connecting' && status !== 'live') return;
        const remote = event.streams[0] ?? new MediaStream([event.track]);
        audio!.srcObject = remote;
        outputAnalyser = analyse(remote);
        void audio!.play().catch(fail);
      };
      peer.onconnectionstatechange = () => {
        if (peer.connectionState !== 'failed') return;
        if (status === 'connecting') fail(new Error('Voice connection failed'));
        else if (status === 'live') finish('connection');
      };
      for (const track of media.getAudioTracks()) peer.addTrack(track, media);
      const channel = peer.createDataChannel('oai-events');
      dc = channel;
      channel.onmessage = message => handleEvent(message.data);
      channel.onclose = () => {
        if (status === 'connecting') fail(new Error('Voice data channel closed during setup'));
        else if (status === 'live') finish('connection');
        else if (status === 'ending') finish(endReason);
      };
      channel.onerror = () => fail(new Error('Voice data channel failed'));
      const offer = await peer.createOffer();
      if (cancelled()) return;
      await peer.setLocalDescription(offer);
      if (cancelled()) return;
      await waitForIce(peer, signal);
      if (cancelled()) return;
      const sdp = peer.localDescription?.sdp;
      if (!sdp) throw new Error('Voice connection did not produce an SDP offer');
      const base = config.baseURL.endsWith('/') ? config.baseURL : `${config.baseURL}/`;
      startedAt = performance.now();
      let response: Response;
      try {
        response = await fetch(new URL('ai/voice/sessions', base), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json', ...config.headers },
          body: JSON.stringify({ video_id: videoId, sdp, viewer, viewer_profile: viewerProfile }),
          signal,
        });
      } catch (error) { throw new VoiceAPIError(undefined, undefined, error); }
      if (cancelled()) return;
      const body = await response.json().catch(() => null);
      if (cancelled()) return;
      if (!response.ok) throw new VoiceAPIError(response, body);
      if (!body || typeof body.session_id !== 'string' || !body.session_id
        || typeof body.sdp !== 'string' || !body.sdp
        || !Number.isFinite(body.max_seconds) || body.max_seconds <= 0
        || !Number.isFinite(body.idle_seconds) || body.idle_seconds <= 0) {
        throw new Error('Invalid voice session response');
      }
      sessionId = body.session_id;
      maxSeconds = body.max_seconds;
      idleSeconds = body.idle_seconds;
      // Enforce the grant even if remote SDP or session.started never completes.
      tick = setInterval(checkLimits, 250);
      checkLimits();
      if (cancelled()) return;
      await peer.setRemoteDescription({ type: 'answer', sdp: body.sdp });
    } catch (error) {
      if (!signal.aborted) fail(error);
    }
  }

  return {
    get status() { return status; },
    get sessionId() { return sessionId; },
    get muted() { return muted; },
    start() {
      if (status === 'ending' || status === 'ended') return Promise.reject(new Error('Voice sessions are single-use; create a new session'));
      if (startup) return startup;
      startup = new Promise((resolve, reject) => { resolveStart = resolve; rejectStart = reject; });
      abort = new AbortController();
      status = 'connecting';
      notify(callbacks.onStatus, status);
      if (status === 'connecting') void connect(abort.signal);
      return startup;
    },
    setMuted(value) {
      muted = value;
      applyPlayback();
    },
    setPlaybackState(value) {
      if (status === 'ending' || status === 'ended') return;
      if (typeof value.playing !== 'boolean') throw new TypeError('playing must be a boolean');
      if (!Number.isFinite(value.currentTime) || value.currentTime < 0) {
        throw new TypeError('currentTime must be a finite, non-negative number');
      }
      const next = { playing: value.playing, currentTime: Math.floor(value.currentTime) };
      if (playback?.playing === next.playing && playback.currentTime === next.currentTime) return;
      playback = next;
      applyPlayback();
      if (status === 'live') lastActivity = performance.now();
      sendPlayback();
    },
    getAudioLevels() {
      return { input: muted || playback?.playing ? 0 : level(inputAnalyser), output: playback?.playing ? 0 : level(outputAnalyser) };
    },
    end: () => end(),
    dispose,
  };
}
