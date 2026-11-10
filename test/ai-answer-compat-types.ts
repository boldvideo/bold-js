import { createClient, type AIResponse, type Segment } from '../src/index';

// Existing consumers can extend the named answer response and use required fields.
interface LabeledAnswer extends AIResponse {
  label: string;
}

function formatSource(source: Segment): string {
  return `${source.title.trim()}: ${source.text.trim()} (${source.playbackId.trim()})`;
}

function formatAnswer(response: AIResponse): string {
  for (const source of response.sources) {
    const title: string = source.title;
    const text: string = source.text;
    const playbackId: string = source.playbackId;
    formatSource(source);
    void [title, text, playbackId];
  }
  return `${response.content.trim()} (${response.usage.inputTokens + response.usage.outputTokens} tokens)`;
}

const answer: LabeledAnswer = {
  label: 'Answer', content: ' An answer ', sources: [], usage: { inputTokens: 2, outputTokens: 3 },
};
formatAnswer(answer);

const ai = createClient('type-test-key').ai;
async function useExistingCalls(stream: boolean): Promise<void> {
  const chat: AIResponse = await ai.chat({ prompt: 'Question', stream: false });
  const ask: AIResponse = await ai.ask({ prompt: 'Question', stream: false });
  const coach: AIResponse = await ai.coach({ prompt: 'Question', stream: false });
  const search: AIResponse = await ai.search({ prompt: 'Question', stream: false });
  const video: AIResponse = await ai.chat({ prompt: 'Question', videoId: 'video-1', stream: false });
  formatAnswer(chat);
  formatAnswer(ask);
  formatAnswer(coach);
  formatAnswer(search);
  formatAnswer(video);
  const maybeStream: Promise<AsyncIterable<unknown> | AIResponse> = ai.chat({ prompt: 'Question', stream });
  void maybeStream;
}
void useExistingCalls;
