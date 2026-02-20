import { LLMRequest, LLMResponse, StreamChunk, LLMProviderConfig } from '@logcat-ai/parser';
import { LLMProvider, fetchWithTimeout, readStreamLines } from './base-provider.js';

export class OllamaProvider implements LLMProvider {
  readonly id = 'ollama';

  constructor(public readonly config: LLMProviderConfig) {}

  async chat(req: LLMRequest): Promise<LLMResponse> {
    const url = `${this.config.baseUrl}/api/chat`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
        stream: false,
        options: {
          temperature: req.temperature ?? 0.3,
          ...(req.maxTokens ? { num_predict: req.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      message: { content: string };
      model: string;
      prompt_eval_count?: number;
      eval_count?: number;
    };

    return {
      content: data.message.content,
      model: data.model,
      tokensUsed: {
        prompt: data.prompt_eval_count ?? 0,
        completion: data.eval_count ?? 0,
      },
    };
  }

  async *chatStream(req: LLMRequest): AsyncIterable<StreamChunk> {
    const url = `${this.config.baseUrl}/api/chat`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: this.config.model,
        messages: [
          { role: 'system', content: req.systemPrompt },
          { role: 'user', content: req.userPrompt },
        ],
        stream: true,
        options: {
          temperature: req.temperature ?? 0.3,
          ...(req.maxTokens ? { num_predict: req.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Ollama stream error ${response.status}: ${await response.text()}`);
    }

    if (!response.body) {
      throw new Error('Ollama returned no body for stream');
    }

    for await (const line of readStreamLines(response.body)) {
      try {
        const data = JSON.parse(line) as { message?: { content: string }; done: boolean };
        yield {
          content: data.message?.content ?? '',
          done: data.done,
        };
      } catch {
        // Skip malformed lines
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    try {
      const response = await fetchWithTimeout(
        `${this.config.baseUrl}/api/tags`,
        { method: 'GET' },
        5000
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
