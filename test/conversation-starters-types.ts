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
  text: 'What does the camera workshop say about exposure?',
  chapter: null,
  video: { id: 'video-1', title: 'Camera workshop', thumbnail: null },
  at: 0,
  conversation: { id: 'conversation-1', title: null },
};
const starters: ConversationStarter[] = [legacy, answered];
const onlyAnswered: AnsweredConversationStarter[] = starters.filter(isAnsweredStarter);
void onlyAnswered;

async function loadAndChat() {
  const client = createClient('test-key');
  const options: ListConversationStartersOptions = { collectionIds: ['collection-1'], viewer: 'external-member' };
  const { data } = await client.conversationStarters.list(options);
  for (const item of data) {
    if (isAnsweredStarter(item)) {
      const chapter: string | null = item.chapter;
      const thumbnail: string | null = item.video.thumbnail;
      const title: string | null = item.conversation.title;
      void [chapter, thumbnail, title];
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
