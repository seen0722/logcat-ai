import { LLMRequest, LLMResponse, StreamChunk, LLMProviderConfig } from '@logcat-ai/parser';
import { LLMProvider, fetchWithTimeout, readStreamLines } from './base-provider.js';

export class OpenAIProvider implements LLMProvider {
  readonly id = 'openai';

  constructor(public readonly config: LLMProviderConfig) {}

  async chat(req: LLMRequest): Promise<LLMResponse> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
        temperature: req.temperature ?? 0.3,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        stream: false,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      choices: Array<{ message: { content: string } }>;
      model: string;
      usage: { prompt_tokens: number; completion_tokens: number };
    };

    return {
      content: data.choices[0]?.message.content ?? '',
      model: data.model,
      tokensUsed: {
        prompt: data.usage.prompt_tokens,
        completion: data.usage.completion_tokens,
      },
    };
  }

  async *chatStream(req: LLMRequest): AsyncIterable<StreamChunk> {
    const url = `${this.config.baseUrl}/v1/chat/completions`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
        temperature: req.temperature ?? 0.3,
        ...(req.maxTokens ? { max_tokens: req.maxTokens } : {}),
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI stream error ${response.status}: ${await response.text()}`);
    }

    if (!response.body) {
      throw new Error('OpenAI returned no body for stream');
    }

    for await (const line of readStreamLines(response.body!)) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);
      if (payload === '[DONE]') {
        yield { content: '', done: true };
        return;
      }

      try {
        const data = JSON.parse(payload) as {
          choices: Array<{ delta: { content?: string }; finish_reason: string | null }>;
        };
        const delta = data.choices[0]?.delta.content ?? '';
        const done = data.choices[0]?.finish_reason != null;
        yield { content: delta, done };
      } catch {
        // Skip malformed lines
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const response = await fetchWithTimeout(
        `${this.config.baseUrl}/v1/models`,
        {
          method: 'GET',
          headers: { 'Authorization': `Bearer ${this.config.apiKey}` },
        },
        5000
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
