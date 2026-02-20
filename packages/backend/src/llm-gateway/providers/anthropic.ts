import { LLMRequest, LLMResponse, StreamChunk, LLMProviderConfig } from '@logcat-ai/parser';
import { LLMProvider, fetchWithTimeout, readStreamLines } from './base-provider.js';

export class AnthropicProvider implements LLMProvider {
  readonly id = 'anthropic';

  constructor(public readonly config: LLMProviderConfig) {}

  async chat(req: LLMRequest): Promise<LLMResponse> {
    const url = `${this.config.baseUrl}/v1/messages`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: req.maxTokens ?? 4096,
        system: req.systemPrompt,
        messages: [{ role: 'user', content: req.userPrompt }],
        temperature: req.temperature ?? 0.3,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      content: Array<{ type: string; text: string }>;
      model: string;
      usage: { input_tokens: number; output_tokens: number };
    };

    const text = data.content
      .filter((c) => c.type === 'text')
      .map((c) => c.text)
      .join('');

    return {
      content: text,
      model: data.model,
      tokensUsed: {
        prompt: data.usage.input_tokens,
        completion: data.usage.output_tokens,
      },
    };
  }

  async *chatStream(req: LLMRequest): AsyncIterable<StreamChunk> {
    const url = `${this.config.baseUrl}/v1/messages`;
    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': this.config.apiKey ?? '',
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: this.config.model,
        max_tokens: req.maxTokens ?? 4096,
        system: req.systemPrompt,
        messages: [{ role: 'user', content: req.userPrompt }],
        temperature: req.temperature ?? 0.3,
        stream: true,
      }),
    });

    if (!response.ok) {
      throw new Error(`Anthropic stream error ${response.status}: ${await response.text()}`);
    }

    if (!response.body) {
      throw new Error('Anthropic returned no body for stream');
    }

    for await (const line of readStreamLines(response.body)) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);

      try {
        const event = JSON.parse(payload) as {
          type: string;
          delta?: { type: string; text?: string };
        };

        if (event.type === 'content_block_delta' && event.delta?.text) {
          yield { content: event.delta.text, done: false };
        } else if (event.type === 'message_stop') {
          yield { content: '', done: true };
        }
      } catch {
        // Skip malformed lines
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      // Simple health check — send minimal request
      const url = `${this.config.baseUrl}/v1/messages`;
      const response = await fetchWithTimeout(
        url,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-api-key': this.config.apiKey ?? '',
            'anthropic-version': '2023-06-01',
          },
          body: JSON.stringify({
            model: this.config.model,
            max_tokens: 1,
            messages: [{ role: 'user', content: 'hi' }],
          }),
        },
        5000
      );
      return response.ok;
    } catch {
      return false;
    }
  }
}
