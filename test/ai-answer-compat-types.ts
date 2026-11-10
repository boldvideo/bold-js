import { createClient, type AIResponse } from '../src/index';

// Existing consumers can extend the named answer response and use required fields.
interface LabeledAnswer extends AIResponse {
  label: string;
}

function formatAnswer(response: AIResponse): string {
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
  formatAnswer(chat);
  formatAnswer(ask);
  formatAnswer(coach);
  formatAnswer(search);
  const maybeStream: Promise<AsyncIterable<unknown> | AIResponse> = ai.chat({ prompt: 'Question', stream });
  void maybeStream;
}
void useExistingCalls;
