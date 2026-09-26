import { createClient, type TrackEngagementOptions } from '../src/index';

const bold = createClient('test-key');
const open = { interactionId: 'interaction-uuid', openId: 'open-uuid', videoId: 'video' };
const source: TrackEngagementOptions = { ...open, event: 'source_open' };
const progress: TrackEngagementOptions = { ...open, event: 'video_progress', watchedSeconds: 0 };
const result: Promise<void> = bold.trackEngagement(progress);
void result;
void bold.trackEngagement(source);

// @ts-expect-error A progress event must carry cumulative watch time.
void bold.trackEngagement({ ...open, event: 'video_progress' });
// @ts-expect-error A source open establishes the open, not watch time.
void bold.trackEngagement({ ...open, event: 'source_open', watchedSeconds: 5 });
// @ts-expect-error Missing interaction IDs must not be sent.
void bold.trackEngagement({ openId: 'open-uuid', videoId: 'video', event: 'source_open' });
