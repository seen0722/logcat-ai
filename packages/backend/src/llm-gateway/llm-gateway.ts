import {
  LLMProviderType,
  StreamChunk,
  ProviderStatus,
  AnalysisResult,
  LLMRequest,
} from '@logcat-ai/parser';
import { getConfig, updateLLMProvider } from '../config.js';
import { LLMProvider } from './providers/base-provider.js';
import { OllamaProvider } from './providers/ollama.js';
import { OpenAIProvider } from './providers/openai.js';
import { GeminiProvider } from './providers/gemini.js';
import { AnthropicProvider } from './providers/anthropic.js';
import { buildAnalysisPrompt } from './prompt-templates/analysis.js';
import { buildChatPrompt, ChatMessage } from './prompt-templates/chat.js';

// ============================================================
// Provider Registry
// ============================================================

function createProvider(type: LLMProviderType): LLMProvider {
  const config = getConfig().llm.providers[type];
  switch (type) {
    case 'ollama': return new OllamaProvider(config);
    case 'openai': return new OpenAIProvider(config);
    case 'gemini': return new GeminiProvider(config);
    case 'anthropic': return new AnthropicProvider(config);
  }
}

function getActiveProvider(): LLMProvider {
  const type = getConfig().llm.defaultProvider;
  return createProvider(type);
}

// ============================================================
// Gateway API
// ============================================================

export async function* analyzeDeep(
  result: AnalysisResult,
  userDescription?: string
): AsyncIterable<StreamChunk> {
  const provider = getActiveProvider();
  const { systemPrompt, userPrompt } = buildAnalysisPrompt(result, userDescription);
  yield* provider.chatStream({ systemPrompt, userPrompt });
}

export async function* chat(
  result: AnalysisResult,
  messages: ChatMessage[]
): AsyncIterable<StreamChunk> {
  const provider = getActiveProvider();
  const { systemPrompt, userPrompt } = buildChatPrompt(result, messages);
  yield* provider.chatStream({ systemPrompt, userPrompt });
}

export async function chatSync(
  result: AnalysisResult,
  messages: ChatMessage[]
) {
  const provider = getActiveProvider();
  const { systemPrompt, userPrompt } = buildChatPrompt(result, messages);
  return provider.chat({ systemPrompt, userPrompt });
}

export async function listProviders(): Promise<ProviderStatus[]> {
  const config = getConfig();
  const types: LLMProviderType[] = ['ollama', 'openai', 'gemini', 'anthropic'];

  const statuses = await Promise.all(
    types.map(async (type) => {
      const provider = createProvider(type);
      try {
        const available = await provider.isAvailable();
        return {
          type,
          available,
          model: config.llm.providers[type].model,
        };
      } catch (err) {
        return {
          type,
          available: false,
          model: config.llm.providers[type].model,
          error: err instanceof Error ? err.message : 'Unknown error',
        };
      }
    })
  );

  return statuses;
}

export function switchProvider(type: LLMProviderType): void {
  updateLLMProvider(type);
}

export function getActiveProviderType(): LLMProviderType {
  return getConfig().llm.defaultProvider;
}

export { ChatMessage };
