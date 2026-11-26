import {
  createClient, type ChatOptions, type ListConversationsOptions,
  type ConversationList, type ConversationSummary, type ConversationVideo,
} from '../src/index';

const ai = createClient('type-test-key').ai;

async function useConversations(): Promise<void> {
  const options: ListConversationsOptions = { viewer: 'viewer-1', limit: 2, offset: 7 };
  const pending: Promise<ConversationList> = ai.listConversations(options);
  const page: ConversationList = await pending;
  await ai.listConversations({ viewer: 'viewer-1' });
  const nextOffset: number = page.pagination.offset + page.pagination.limit;
  const hasMore: boolean = page.pagination.hasMore;
  for (const conversation of page.conversations) {
    const summary: ConversationSummary = conversation;
    const video: ConversationVideo | null = summary.video;
    const channel: NonNullable<ChatOptions['channel']> = summary.channel;
    const scope: 'library' | 'video' | null = summary.scope;
    const title: string | null = summary.title;
    const preview: string | null = summary.preview;
    const client: string | null = summary.client;
    const count: number = summary.messageCount;
    const id: string = summary.conversationId;
    const status: string = summary.status;
    const createdAt: string = summary.createdAt;
    const updatedAt: string = summary.updatedAt;
    if (video) {
      const thumbnailUrl: string | null = video.thumbnailUrl;
      const url: string | null = video.url;
      video.title.trim();
      video.id.trim();
      // @ts-expect-error Thumbnail URLs can be null.
      video.thumbnailUrl.trim();
      void [thumbnailUrl, url];
    }
    // @ts-expect-error A conversation may have no video.
    summary.video.id;
    // @ts-expect-error Only shipped response fields are exposed.
    summary.focusVideo;
    void [channel, scope, title, preview, client, count, id, status, createdAt, updatedAt];
  }
  // @ts-expect-error Viewer is required.
  ai.listConversations({ limit: 2 });
  // @ts-expect-error Options are required.
  ai.listConversations();
  // @ts-expect-error Viewer is an identity string.
  ai.listConversations({ viewer: true });
  // @ts-expect-error Pagination uses camelCase keys.
  page.pagination.has_more;
  void [nextOffset, hasMore];
}
void useConversations;

const video: ConversationVideo = { id: 'video-1', title: 'Synthetic lesson', thumbnailUrl: null, url: null };
const summary: ConversationSummary = {
  conversationId: 'conversation-1', scope: null, title: null, preview: null,
  status: 'active', messageCount: 0, video, channel: 'unknown', client: null,
  createdAt: '2026-01-01T09:00:00Z', updatedAt: '2026-01-01T09:00:00Z',
};
// @ts-expect-error Channel is required and cannot be undefined.
const undefinedChannel: ConversationSummary = { ...summary, channel: undefined };
const { channel, ...withoutChannel } = summary;
// @ts-expect-error Channel cannot be omitted.
const missingChannel: ConversationSummary = withoutChannel;
void [undefinedChannel, missingChannel];
