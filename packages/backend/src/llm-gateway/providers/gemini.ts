import { LLMRequest, LLMResponse, StreamChunk, LLMProviderConfig } from '@logcat-ai/parser';
import { LLMProvider, fetchWithTimeout, readStreamLines } from './base-provider.js';

export class GeminiProvider implements LLMProvider {
  readonly id = 'gemini';

  constructor(public readonly config: LLMProviderConfig) {}

  private buildContents(req: LLMRequest) {
    return [
      { role: 'user', parts: [{ text: `${req.systemPrompt}\n\n${req.userPrompt}` }] },
    ];
  }

  async chat(req: LLMRequest): Promise<LLMResponse> {
    const url =
      `${this.config.baseUrl}/v1beta/models/${this.config.model}:generateContent?key=${this.config.apiKey}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: this.buildContents(req),
        generationConfig: {
          temperature: req.temperature ?? 0.3,
          ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as {
      candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      usageMetadata?: { promptTokenCount: number; candidatesTokenCount: number };
    };

    const text = data.candidates[0]?.content.parts
      .map((p) => p.text)
      .join('') ?? '';

    return {
      content: text,
      model: this.config.model,
      tokensUsed: {
        prompt: data.usageMetadata?.promptTokenCount ?? 0,
        completion: data.usageMetadata?.candidatesTokenCount ?? 0,
      },
    };
  }

  async *chatStream(req: LLMRequest): AsyncIterable<StreamChunk> {
    const url =
      `${this.config.baseUrl}/v1beta/models/${this.config.model}:streamGenerateContent?alt=sse&key=${this.config.apiKey}`;

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: this.buildContents(req),
        generationConfig: {
          temperature: req.temperature ?? 0.3,
          ...(req.maxTokens ? { maxOutputTokens: req.maxTokens } : {}),
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Gemini stream error ${response.status}: ${await response.text()}`);
    }

    if (!response.body) {
      throw new Error('Gemini returned no body for stream');
    }

    for await (const line of readStreamLines(response.body)) {
      if (!line.startsWith('data: ')) continue;
      const payload = line.slice(6);

      try {
        const data = JSON.parse(payload) as {
          candidates: Array<{
            content: { parts: Array<{ text: string }> };
            finishReason?: string;
          }>;
        };
        const text = data.candidates[0]?.content.parts
          .map((p) => p.text)
          .join('') ?? '';
        const done = data.candidates[0]?.finishReason != null;
        yield { content: text, done };
      } catch {
        // Skip malformed lines
      }
    }
  }

  async isAvailable(): Promise<boolean> {
    if (!this.config.apiKey) return false;
    try {
      const url = `${this.config.baseUrl}/v1beta/models?key=${this.config.apiKey}`;
      const response = await fetchWithTimeout(url, { method: 'GET' }, 5000);
      return response.ok;
    } catch {
      return false;
    }
  }
}
