import {
  streamUrl, muxPlayerProps, thumbnailUrl,
  type Video, type Segment, type Citation, type Source, type RecommendationVideo,
  type PlaybackSource, type ThumbnailOptions,
} from '../src/index';

// Existing response shapes still compile without any secure playback fields.
const video: Video = {
  captions: '', captionsLabel: '', captionsLang: '', description: null, duration: 60,
  id: 'video-id', importedFrom: null, legacyVideoUrl: null, playbackId: 'playback-id',
  publishedAt: '', streamUrl: '', teaser: null, thumbnail: '', title: 'Example video',
  type: 'video', metaData: { description: '', title: '', image: null }, internalId: 'video-id',
};
const segment: Segment = {
  id: 'segment-id', videoId: 'video-id', title: 'Example video', text: 'Transcript',
  timestamp: 0, timestampEnd: 10, playbackId: 'playback-id',
};
const citation: Citation = segment;
const source: Source = segment;
const recommendation: RecommendationVideo = {
  videoId: 'video-id', title: 'Example video', playbackId: 'playback-id', relevance: 1, reason: '',
};
const sparse: PlaybackSource = { playbackPolicy: 'signed', thumbnail: null };
const options: ThumbnailOptions = { width: 640, height: 360, time: 0, fitMode: 'crop' };

for (const input of [video, segment, citation, source, recommendation, sparse]) {
  const url: string | undefined = streamUrl(input);
  const poster: string | undefined = thumbnailUrl(input, options);
  // Compatible with optional Mux Player props, including exactOptionalPropertyTypes.
  const props: { playbackId?: string; tokens?: { playback: string; storyboard?: string }; poster?: string } =
    muxPlayerProps(input);
  void [url, poster, props];
}

video.playbackPolicy = null;
video.playbackToken = null;
video.storyboardToken = null;
video.playbackTokenExpiresAt = null;
segment.playbackToken = null;
recommendation.playbackToken = null;

// @ts-expect-error Only supported playback policies are accepted.
streamUrl({ playbackPolicy: 'private' });
// @ts-expect-error Use the Mux fit-mode values.
thumbnailUrl(video, { fitMode: 'cover' });
