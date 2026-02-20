import { LLMProviderType, LLMProviderConfig } from '@logcat-ai/parser';

export interface AppConfig {
  port: number;
  uploadDir: string;
  maxFileSize: number; // bytes
  llm: {
    defaultProvider: LLMProviderType;
    providers: Record<LLMProviderType, LLMProviderConfig>;
  };
}

function env(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export function loadConfig(): AppConfig {
  return {
    port: parseInt(env('PORT', '8000'), 10),
    uploadDir: env('UPLOAD_DIR', '/tmp/logcat-ai-uploads'),
    maxFileSize: parseInt(env('MAX_FILE_SIZE', String(200 * 1024 * 1024)), 10), // 200MB

    llm: {
      defaultProvider: env('LLM_PROVIDER', 'ollama') as LLMProviderType,
      providers: {
        ollama: {
          type: 'ollama',
          baseUrl: env('OLLAMA_BASE_URL', 'http://localhost:11434'),
          model: env('OLLAMA_MODEL', 'qwen2.5:72b'),
        },
        openai: {
          type: 'openai',
          baseUrl: env('OPENAI_BASE_URL', 'https://api.openai.com'),
          model: env('OPENAI_MODEL', 'gpt-4o'),
          apiKey: process.env.OPENAI_API_KEY,
        },
        gemini: {
          type: 'gemini',
          baseUrl: env('GEMINI_BASE_URL', 'https://generativelanguage.googleapis.com'),
          model: env('GEMINI_MODEL', 'gemini-2.0-flash'),
          apiKey: process.env.GEMINI_API_KEY,
        },
        anthropic: {
          type: 'anthropic',
          baseUrl: env('ANTHROPIC_BASE_URL', 'https://api.anthropic.com'),
          model: env('ANTHROPIC_MODEL', 'claude-sonnet-4-5-20250929'),
          apiKey: process.env.ANTHROPIC_API_KEY,
        },
      },
    },
  };
}

// Mutable runtime config (can be changed via settings API)
let currentConfig: AppConfig | null = null;

export function getConfig(): AppConfig {
  if (!currentConfig) {
    currentConfig = loadConfig();
  }
  return currentConfig;
}

export function updateLLMProvider(type: LLMProviderType): void {
  const config = getConfig();
  config.llm.defaultProvider = type;
}

export function updateProviderConfig(
  type: LLMProviderType,
  updates: Partial<LLMProviderConfig>
): void {
  const config = getConfig();
  Object.assign(config.llm.providers[type], updates);
}
