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
import { buildChatPrompt } from './prompt-templates/chat.js';
import type { ChatMessage } from './prompt-templates/chat.js';
import { buildToolSystemPrompt } from './tool-definitions.js';
import { executeTool } from './tool-executor.js';
import { analyzeDeepAgentic as _analyzeDeepAgentic } from './agentic-analysis.js';
export type { AgenticStreamChunk as AgenticDeepStreamChunk } from './agentic-analysis.js';

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

export function analyzeDeepAgentic(
  analysisId: string,
  result: AnalysisResult,
  userDescription?: string,
) {
  const provider = getActiveProvider();
  return _analyzeDeepAgentic(analysisId, result, provider, userDescription);
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

// ============================================================
// Agentic Chat (with tool calling)
// ============================================================

/**
 * Extended stream chunk that can include tool call/result events.
 */
export interface AgenticStreamChunk extends StreamChunk {
  toolCall?: { name: string; args: string };
  toolResult?: { name: string; content: string };
}

/**
 * Chat with tool calling support (prompt-based approach).
 *
 * The LLM is given tool descriptions in the system prompt. When it needs
 * more data, it responds with a ```tool_call``` block. We parse it,
 * execute the tool, append the result to context, and loop.
 *
 * Max 5 iterations to prevent runaway loops.
 */
export async function* chatWithTools(
  analysisId: string,
  result: AnalysisResult,
  messages: ChatMessage[],
): AsyncIterable<AgenticStreamChunk> {
  const provider = getActiveProvider();
  const { systemPrompt, userPrompt } = buildChatPrompt(result, messages);

  // Enhance system prompt with tool descriptions
  const toolSystemPrompt = systemPrompt + '\n\n' + buildToolSystemPrompt();

  let currentUserPrompt = userPrompt;
  const maxIterations = 5;

  for (let i = 0; i < maxIterations; i++) {
    // Non-streaming call to check for tool use
    const response = await provider.chat({
      systemPrompt: toolSystemPrompt,
      userPrompt: currentUserPrompt,
    });

    // Try to parse a tool call from the response
    const toolCallMatch = response.content.match(/```tool_call\s*\n([\s\S]*?)\n```/);
    if (toolCallMatch) {
      try {
        const parsed = JSON.parse(toolCallMatch[1]) as {
          name: string;
          arguments: Record<string, unknown>;
        };

        // Emit tool call event for frontend display
        yield {
          content: '',
          done: false,
          toolCall: { name: parsed.name, args: JSON.stringify(parsed.arguments) },
        };

        // Execute the tool
        const toolResult = executeTool(analysisId, {
          id: `call_${i}`,
          function: {
            name: parsed.name,
            arguments: JSON.stringify(parsed.arguments),
          },
        });

        // Emit tool result event (preview only)
        const preview = toolResult.content.length > 300
          ? toolResult.content.slice(0, 300) + '...'
          : toolResult.content;
        yield {
          content: '',
          done: false,
          toolResult: { name: parsed.name, content: preview },
        };

        // Append tool result to context for next LLM iteration
        currentUserPrompt += `\n\n[Tool "${parsed.name}" returned]:\n${toolResult.content}\n\nBased on the above tool result, continue answering the user's question. If you need more data, call another tool. Otherwise, provide your final answer directly (without tool_call block).`;
      } catch {
        // Malformed tool call JSON — treat the entire response as text
        yield { content: response.content, done: true };
        return;
      }
    } else {
      // No tool call — this is the final text response.
      // Stream it back for a better UX.
      yield { content: response.content, done: true };
      return;
    }
  }

  // Max iterations reached
  yield { content: '\n\n[Reached maximum investigation steps (5). Providing best answer with available information.]', done: true };
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
