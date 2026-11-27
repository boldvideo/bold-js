import {
  createClient,
  isAnsweredStarter,
  type AnsweredConversationStarter,
  type ConversationStarter,
  type ConversationStarterSource,
  type ListConversationStartersOptions,
} from '../src/index';

const legacy: ConversationStarter = { text: 'Explore', source: 'collection', collectionId: 'collection-1' };
const answered: AnsweredConversationStarter = {
  kind: 'answered',
  reason: 'unanswered',
  text: 'What does the camera workshop say about exposure?',
  chapter: null,
  video: { id: 'video-1', title: 'Camera workshop', thumbnail: null },
  at: 0,
  conversation: { id: 'conversation-1', title: null },
};
const revisited: AnsweredConversationStarter = { ...answered, reason: 'revisited' };
const { reason, ...withoutReason } = answered;
// @ts-expect-error Answered starters require a reason.
const missingReason: ConversationStarter = withoutReason;
// @ts-expect-error Answered starters only accept the documented reasons.
const invalidReason: AnsweredConversationStarter = { ...answered, reason: 'other' };
void [reason, missingReason, invalidReason];
const starters: ConversationStarter[] = [legacy, answered, revisited];
const onlyAnswered: AnsweredConversationStarter[] = starters.filter(isAnsweredStarter);
void onlyAnswered;

async function loadAndChat() {
  const client = createClient('test-key');
  const options: ListConversationStartersOptions = { collectionIds: ['collection-1'], viewer: 'external-member' };
  const { data } = await client.conversationStarters.list(options);
  for (const item of data) {
    if (isAnsweredStarter(item)) {
      const reason: 'unanswered' | 'revisited' = item.reason;
      const chapter: string | null = item.chapter;
      const thumbnail: string | null = item.video.thumbnail;
      const title: string | null = item.conversation.title;
      void [reason, chapter, thumbnail, title];
      // @ts-expect-error Conversation metadata is nullable.
      const nonNullTitle: string = item.conversation.title;
      void nonNullTitle;
      await client.ai.chat({ prompt: item.text, viewer: options.viewer, focus: { videoId: item.video.id, currentTime: item.at } });
    } else {
      const source: ConversationStarterSource = item.source;
      const collectionId: string | null = item.collectionId;
      void [source, collectionId];
      // @ts-expect-error Legacy starters have no video.
      void item.video;
    }
  }
  // @ts-expect-error Viewers are UUIDs or external IDs, both strings.
  await client.conversationStarters.list({ viewer: 42 });
}
void loadAndChat;
