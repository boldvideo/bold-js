// Real browser media/RTC plumbing with a local peer, never a provider call.
import { createClient } from './sdk.js';

export async function runLoopback() {
  const assert = (condition, check) => { if (!condition) throw new Error(check); };
  const wait = async predicate => {
    const deadline = performance.now() + 10000;
    while (!predicate()) {
      if (performance.now() > deadline) throw new Error('Timed out waiting for loopback');
      await new Promise(resolve => setTimeout(resolve, 50));
    }
  };
  const originalFetch = window.fetch;
  const getUserMedia = navigator.mediaDevices.getUserMedia;
  const peer = new RTCPeerConnection();
  const context = new AudioContext();
  const oscillator = context.createOscillator();
  const destination = context.createMediaStreamDestination();
  oscillator.connect(destination);
  oscillator.start();
  const incoming = context.createAnalyser();
  incoming.fftSize = 512;
  const samples = new Uint8Array(512);
  let media, channel, closeReceived = false, incomingConnected = false;
  const statuses = [], errors = [], playback = [];
  let captions = [];
  const rms = () => {
    incoming.getByteTimeDomainData(samples);
    return Math.sqrt(samples.reduce((sum, x) => sum + ((x - 128) / 128) ** 2, 0) / samples.length);
  };
  const session = createClient('synthetic-key', { baseURL: 'https://loopback.invalid/api/v1/' }).ai.voice.createSession({
    videoId: 'synthetic-video', viewer: 'synthetic-viewer', viewerProfile: { skill_level: 'new' },
    onStatus: value => statuses.push(value), onError: error => errors.push(error), onCaptions: value => { captions = value; },
  });
  try {
    await context.resume();
    navigator.mediaDevices.getUserMedia = async constraints => {
      media = await getUserMedia.call(navigator.mediaDevices, constraints);
      return media;
    };
    peer.ontrack = event => {
      context.createMediaStreamSource(event.streams[0]).connect(incoming);
      incomingConnected = true;
    };
    peer.ondatachannel = event => {
      channel = event.channel;
      channel.onopen = () => {
        for (const event of [
          { type: 'session.started' },
          { type: 'session.output_transcript.delta', delta: 'See 1:' },
          { type: 'session.input_transcript.delta', delta: 'Okay' },
          { type: 'session.output_transcript.delta', delta: '23 now' },
        ]) channel.send(JSON.stringify(event));
      };
      channel.onmessage = message => {
        const event = JSON.parse(message.data);
        if (event.type === 'session.thinking.append') playback.push(event.content);
        if (event.type === 'session.close') {
          closeReceived = true;
          channel.send(JSON.stringify({ type: 'session.closed' }));
        }
      };
    };
    window.fetch = async (url, init) => {
      assert(String(url) === 'https://loopback.invalid/api/v1/ai/voice/sessions', 'Unexpected broker URL');
      const body = JSON.parse(init.body);
      assert(body.viewer === 'synthetic-viewer' && body.viewer_profile.skill_level === 'new', 'Viewer context not forwarded');
      await peer.setRemoteDescription({ type: 'offer', sdp: body.sdp });
      peer.addTrack(destination.stream.getAudioTracks()[0], destination.stream);
      await peer.setLocalDescription(await peer.createAnswer());
      await wait(() => peer.iceGatheringState === 'complete');
      return Response.json({ session_id: 'synthetic-session', sdp: peer.localDescription.sdp, max_seconds: 30, idle_seconds: 10 });
    };
    await session.start();
    assert(session.status === 'live', 'Startup did not become live');
    await wait(() => captions[0]?.text === 'See 1:23 now' && session.getAudioLevels().output > 0.02 && incomingConnected && rms() > 0.02);
    const outputRms = session.getAudioLevels().output;
    const inputRmsAtPeer = rms();
    assert(captions[0].segments[1].seconds === 83 && captions.length === 2, 'Caption timestamp mismatch');
    session.setMuted(true);
    assert(media.getAudioTracks().every(t => !t.enabled), 'Mute did not disable tracks');
    session.setPlaybackState({ playing: true, currentTime: 83 });
    session.setMuted(false);
    assert(media.getAudioTracks().every(t => !t.enabled), 'Playback failed to preserve mic suppression');
    assert(session.getAudioLevels().input === 0 && session.getAudioLevels().output === 0, 'Playback levels not muted');
    session.setPlaybackState({ playing: false, currentTime: 90 });
    assert(media.getAudioTracks().every(t => t.enabled), 'Pause failed to restore microphone');
    await wait(() => playback.length === 2);
    assert(playback[0].includes('1:23') && playback[1].includes('1:30'), 'Playback context mismatch');
    const ending = session.end();
    assert(media.getTracks().every(t => t.readyState === 'ended'), 'Microphone not released synchronously');
    await ending;
    assert(closeReceived, 'Close not acknowledged');
    assert(statuses.join(',') === 'connecting,live,ending,ended' && errors.length === 0, 'Lifecycle mismatch');
    return { passed: true, synthetic: true, statuses, timestampSeconds: 83, outputRms, inputRmsAtPeer, closeReceived, microphoneStopped: true };
  } finally {
    session.dispose();
    media?.getTracks().forEach(t => t.stop());
    navigator.mediaDevices.getUserMedia = getUserMedia;
    window.fetch = originalFetch;
    peer.close();
    oscillator.stop();
    destination.stream.getTracks().forEach(t => t.stop());
    await context.close();
  }
}
