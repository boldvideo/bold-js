import { createClient, type AIEvent, type AIResponse, type ChatOptions, type AIScope, type AIPointer, type AILockedMatch } from '../src/index';

// SYNTHETIC camelized contracts, not recorded server output.
const focus = { videoId: 'lesson-1', title: 'Lesson' };
const covered: AIScope = { answeredFrom: 'focus', widenedFrom: null, reason: null, focus };
const widened: AIScope = { answeredFrom: 'library', widenedFrom: 'focus', reason: 'not_covered', focus };
const missed: AIScope = { answeredFrom: 'none', widenedFrom: 'focus', reason: 'requested', focus };
const pointers: AIPointer[] = [{ videoId: 'lesson-2', title: 'Other lesson', collectionId: 'course', canonicalUrl: 'https://example.com/lesson', moments: [{ timestamp: 94, timestampEnd: 131, timestampUrl: 'https://example.com/lesson?t=94' }] }];
const lockedMatches: AILockedMatch[] = [{ offer: 'membership', collectionIds: ['course'], videoCount: 2, titles: ['Lesson'] }];
const turns: AIEvent[] = [
  { type: 'conversation_created', conversationId: 'thread-1' },
  { type: 'progress', stage: 'reading', message: 'Reading', scope: 'focus' },
  { type: 'scope', ...covered },
  { type: 'message_complete', content: 'See [01:34]', sources: [{ videoId: 'lesson-1', timestamp: 94 }], scope: covered },
  { type: 'progress', stage: 'widening', message: 'Searching', scope: 'library' },
  { type: 'scope', ...widened },
  { type: 'citation_map', citationMap: {} },
  { type: 'answer', content: 'Library answer', citationMap: {} },
  { type: 'message_complete', content: 'Library answer', sources: [], scope: widened },
  { type: 'pointers', pointers },
  { type: 'message_complete', content: 'Try another lesson', sources: [], scope: missed, pointers },
  { type: 'locked_matches', lockedMatches },
  { type: 'message_complete', content: 'Other content exists', sources: [], scope: missed, lockedMatches },
];

for (const event of turns) {
  if (event.type === 'scope') { const scope: AIScope = event; void scope.answeredFrom; }
  if (event.type === 'pointers') { const time: number | undefined = event.pointers[0]?.moments[0]?.timestampEnd; void time; }
  if (event.type === 'locked_matches') { const count: number | undefined = event.lockedMatches[0]?.videoCount; void count; }
  if (event.type === 'conversation_created') { const id: string = event.conversationId; void id; }
  if (event.type === 'citation_map') { const id: string | undefined = event.citationMap['c_a1b2']?.videoId; void id; }
  if (event.type === 'answer') { const text: string = event.content; void text; }
  if (event.type === 'message_complete') {
    const id: string | undefined = event.sources?.[0]?.videoId;
    const scope: AIScope | undefined = event.scope;
    void [id, scope, event.pointers, event.lockedMatches];
  }
}

const options: ChatOptions = {
  prompt: 'Question', focus: { videoId: 'lesson-1', currentTime: 0 },
  access: { answer: [], point: ['course'], mention: [{ collectionId: 'members', offer: 'membership' }] },
  viewer: 'viewer-1', viewerProfile: { experience: 'beginner', years: 2, subscribed: false },
  collectionIds: [], synthesize: false,
};
const ai = createClient('test-key').ai;
const stream: Promise<AsyncIterable<AIEvent>> = ai.chat({ ...options, stream: true });
const json: Promise<AIResponse> = ai.chat({ ...options, stream: false });
void [stream, json];
// @ts-expect-error Wire keys are not the SDK's request shape.
const badFocus: ChatOptions = { prompt: 'Question', focus: { video_id: 'lesson-1' } };
// @ts-expect-error A locked match uses camelCase fields.
const badMatch: AILockedMatch = { offer: 'membership', collection_ids: [], video_count: 2, titles: [] };
void [badFocus, badMatch];
