import { createClient, AIAPIError, type AIEvent, type AIResponse, type AIChatResponse, type AIRetrievalResponse, type ChatOptions, type GetConversationOptions, type AIScope, type AIPointer, type AILockedMatch, type AICitationSource, type AISource, type Segment } from '../src/index';

function useError(error: unknown): void {
  if (error instanceof AIAPIError) {
    const code: string | undefined = error.code;
    const retryable: boolean | undefined = error.retryable;
    void [code, retryable];
  }
}
void useError;

function useSource(source: AISource): void {
  // @ts-expect-error Focus sources can omit title; library titles can be null.
  source.title.trim();
  // @ts-expect-error Minimal or nullable sources are not legacy Segments.
  const segment: Segment = source;
  if ('text' in source) {
    const text: string = source.text;
    const title: string | undefined = source.title?.trim();
    const playbackId: string | undefined = source.playbackId?.trim();
    void [text, title, playbackId];
  }
  void segment;
}

// SYNTHETIC camelized contracts, not recorded server output.
const focus = { videoId: 'lesson-1', title: 'Lesson' };
const covered: AIScope = { answeredFrom: 'focus', widenedFrom: null, reason: null, focus };
const widened: AIScope = { answeredFrom: 'library', widenedFrom: 'focus', reason: 'not_covered', focus };
const missed: AIScope = { answeredFrom: 'none', widenedFrom: 'focus', reason: 'requested', focus };
const pointers: AIPointer[] = [{ videoId: 'lesson-2', title: 'Other lesson', collectionId: 'course', canonicalUrl: 'https://example.com/lesson', moments: [{ timestamp: 94, timestampEnd: 131, timestampUrl: 'https://example.com/lesson?t=94' }] }];
const lockedMatches: AILockedMatch[] = [{ offer: 'membership', collectionIds: ['course'], videoCount: 2, titles: ['Lesson'] }];
const resource: AICitationSource = {
  id: 'resource-citation', sourceType: 'resource', resourceId: 'resource-1',
  title: 'Guide', text: 'Excerpt', videoId: null, timestamp: null, timestampEnd: null, playbackId: null,
};
const turns: AIEvent[] = [
  { type: 'conversation_created', conversationId: 'thread-1' },
  { type: 'progress', stage: 'reading', message: 'Reading', scope: 'focus' },
  { type: 'scope', ...covered },
  { type: 'message_complete', content: 'See [01:34]', sources: [{ videoId: 'lesson-1', timestamp: 94 }], scope: covered },
  { type: 'progress', stage: 'widening', message: 'Searching', scope: 'library' },
  { type: 'scope', ...widened },
  { type: 'citation_map', citationMap: { c_resource: resource } },
  { type: 'answer', content: 'Library answer', citationMap: { c_resource: 0, c_other: 1 } },
  { type: 'message_complete', content: 'Library answer', sources: [], scope: widened },
  { type: 'pointers', pointers },
  { type: 'message_complete', content: 'Try another lesson', sources: [], scope: missed, pointers },
  { type: 'locked_matches', lockedMatches },
  { type: 'message_complete', content: 'Other content exists', sources: [], scope: missed, lockedMatches },
  { type: 'message_complete', responseType: 'retrieval', sources: [resource], confidence: 'high', metadata: { sourcesTruncated: false } },
];

for (const event of turns) {
  if (event.type === 'scope') { const scope: AIScope = event; void scope.answeredFrom; }
  if (event.type === 'pointers') { const time: number | undefined = event.pointers[0]?.moments[0]?.timestampEnd; void time; }
  if (event.type === 'locked_matches') { const count: number | undefined = event.lockedMatches[0]?.videoCount; void count; }
  if (event.type === 'conversation_created') { const id: string = event.conversationId; void id; }
  if (event.type === 'citation_map') { const id: string | null | undefined = event.citationMap['c_resource']?.videoId; void id; }
  if (event.type === 'answer') {
    const index: number | undefined = event.citationMap?.['c_resource'];
    const text: string = event.content;
    void [index, text];
  }
  if (event.type === 'message_complete') {
    const id: string | null | undefined = event.sources?.[0]?.videoId;
    const scope: AIScope | undefined = event.scope;
    event.sources?.forEach(useSource);
    void [id, scope, event.pointers, event.lockedMatches];
    if (event.responseType === 'retrieval') {
      const content: undefined = event.content;
      const confidence: string = event.confidence;
      void [content, confidence];
    } else {
      const content: string = event.content;
      void content;
    }
  }
}

const retrieval: AIRetrievalResponse = { responseType: 'retrieval', sources: [resource], confidence: 'high', metadata: {} };
const focusedRetrieval: AIRetrievalResponse = { ...retrieval, scope: widened };
function useResponse(response: AIChatResponse | AIRetrievalResponse): void {
  response.sources.forEach(useSource);
  if (response.responseType === 'retrieval') {
    const confidence: string = response.confidence;
    const metadata: Record<string, unknown> = response.metadata;
    void [confidence, metadata];
    // @ts-expect-error Retrieval does not contain answer content.
    response.content.trim();
    // @ts-expect-error Retrieval does not contain synthesis usage.
    response.usage.inputTokens;
  } else {
    const content: string = response.content;
    if (response.usage) {
      const tokens: number = 'inputTokens' in response.usage ? response.usage.inputTokens : response.usage.promptTokens;
      void tokens;
    }
    void content;
  }
}
useResponse(retrieval);
useResponse(focusedRetrieval);
// @ts-expect-error Terminal answer maps contain indices, not source metadata.
const badAnswerMap: Extract<AIEvent, { type: 'answer' }> = { type: 'answer', content: 'Answer', citationMap: { c_resource: resource } };
// @ts-expect-error The citation_map event contains metadata, not indices.
const badSourceMap: Extract<AIEvent, { type: 'citation_map' }> = { type: 'citation_map', citationMap: { c_resource: 0 } };
// @ts-expect-error Retrieval-only responses do not contain an answer or synthesis usage.
const badRetrieval: AIRetrievalResponse = { responseType: 'retrieval', content: 'Invented answer', usage: { inputTokens: 1, outputTokens: 2 }, sources: [], confidence: 'none', metadata: {} };
void [badAnswerMap, badSourceMap, badRetrieval];

const options: ChatOptions = {
  prompt: 'Question', focus: { videoId: 'lesson-1', currentTime: 0 },
  access: { answer: [], point: ['course'], mention: [{ collectionId: 'members', offer: 'membership' }] },
  viewer: 'viewer-1', viewerProfile: { experience: 'beginner', years: 2, subscribed: false },
  collectionIds: [], synthesize: false,
};
const ai = createClient('test-key').ai;
const stream: Promise<AsyncIterable<AIEvent>> = ai.chat({ ...options, stream: true });
const json: Promise<AIChatResponse | AIRetrievalResponse> = ai.chat({ ...options, stream: false });
void [stream, json];

async function useSynthesisOptions(synthesize: boolean, stream: boolean): Promise<void> {
  for (const method of [ai.chat, ai.ask, ai.coach]) {
    const retrieval: AIRetrievalResponse = await method({ prompt: 'Question', focus: { videoId: 'lesson-1' }, stream: false, synthesize: false });
    const confidence: string = retrieval.confidence;
    const scope: AIScope | undefined = retrieval.scope;
    if (scope) {
      const answeredFrom: 'focus' | 'library' | 'none' = scope.answeredFrom;
      void answeredFrom;
    }
    const answer: AIResponse = await method({ prompt: 'Question', stream: false, synthesize: true });
    const content: string = answer.content.trim();
    const tokens: number = answer.usage.inputTokens;
    const defaultStream: AsyncIterable<AIEvent> = await method({ prompt: 'Question' });
    const retrievalStream: AsyncIterable<AIEvent> = await method({ prompt: 'Question', synthesize: false });
    const explicitStream: AsyncIterable<AIEvent> = await method({ prompt: 'Question', stream: true, synthesize });
    const dynamic: AIChatResponse | AIRetrievalResponse = await method({ prompt: 'Question', stream: false, synthesize });
    useResponse(dynamic);
    // @ts-expect-error An unknown synthesis flag requires narrowing before accessing answer content.
    dynamic.content.trim();
    // @ts-expect-error Retrieval-only calls cannot be assigned to an answer response.
    const wrong: AIResponse = await method({ prompt: 'Question', stream: false, synthesize: false });
    const dynamicMode: AsyncIterable<AIEvent> | AIChatResponse | AIRetrievalResponse = await method({ prompt: 'Question', stream, synthesize });
    void [confidence, content, tokens, defaultStream, retrievalStream, explicitStream, wrong, dynamicMode];
    for (const optIn of [{ focus: { videoId: 'lesson-1' } }, { access: { answer: [] } }]) {
      const response = await method({ prompt: 'Question', stream: false, ...optIn });
      const content: string = response.content.trim();
      // @ts-expect-error Opt-in focus/access usage may be null or use library token names.
      response.usage.inputTokens;
      // @ts-expect-error The SDK does not invent token totals.
      response.usage?.totalTokens;
      useResponse(response);
      void content;
    }
  }
}
void useSynthesisOptions;

async function useHistory(): Promise<void> {
  const history = await ai.getConversation('thread-1');
  const options: GetConversationOptions = { viewer: 'viewer-1', access: {}, focus: { videoId: 'lesson-1', currentTime: 0 } };
  const gated = await ai.getConversation('thread-1', options);
  const conversationId: string = gated.conversationId;
  await ai.getConversation('thread-1', {});
  // @ts-expect-error History options use SDK keys, not wire keys.
  await ai.getConversation('thread-1', { focus: { video_id: 'lesson-1' } });
  // @ts-expect-error Viewer is an identity string, not an authorization boolean.
  await ai.getConversation('thread-1', { viewer: true });
  void conversationId;
  const assistant = history.messages.find(message => message.role === 'assistant');
  assistant?.sources.forEach(useSource);
  const scope: AIScope | undefined = assistant?.scope;
  const pointers: AIPointer[] | undefined = assistant?.pointers;
  const lockedMatches: AILockedMatch[] | undefined = assistant?.lockedMatches;
  const videoId: string | null | undefined = assistant?.sources[0]?.videoId;
  const interactionId: string | null | undefined = assistant?.interactionId;
  const currentTime: number | undefined = history.messages[0]?.focus?.currentTime;
  void [scope, pointers, lockedMatches, videoId, interactionId, currentTime];
}
void useHistory;

// SYNTHETIC no-portal variant; the recorded captures have populated portal URLs.
const noPortal: AIPointer = { videoId: 'lesson-2', title: 'Lesson', collectionId: 'course', canonicalUrl: null, moments: [{ timestamp: 94, timestampEnd: 111, timestampUrl: null }] };
const maybeUrl: string | undefined = noPortal.canonicalUrl?.trim();
// @ts-expect-error Pointer URLs require a null guard.
noPortal.canonicalUrl.trim();
void maybeUrl;
// @ts-expect-error Wire keys are not the SDK's request shape.
const badFocus: ChatOptions = { prompt: 'Question', focus: { video_id: 'lesson-1' } };
// @ts-expect-error A locked match uses camelCase fields.
const badMatch: AILockedMatch = { offer: 'membership', collection_ids: [], video_count: 2, titles: [] };
void [badFocus, badMatch];
