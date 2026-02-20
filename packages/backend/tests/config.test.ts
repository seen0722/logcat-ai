import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// We test config logic by re-importing after env manipulation.
// Since getConfig() caches, we test loadConfig directly.

describe('Config', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it('should use defaults when no env vars set', async () => {
    delete process.env.PORT;
    delete process.env.LLM_PROVIDER;
    delete process.env.OLLAMA_MODEL;

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.port).toBe(8000);
    expect(config.llm.defaultProvider).toBe('ollama');
    expect(config.llm.providers.ollama.model).toBe('qwen2.5:72b');
    expect(config.maxFileSize).toBe(200 * 1024 * 1024);
  });

  it('should read PORT from env', async () => {
    process.env.PORT = '3000';

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.port).toBe(3000);
  });

  it('should read LLM_PROVIDER from env', async () => {
    process.env.LLM_PROVIDER = 'openai';

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.llm.defaultProvider).toBe('openai');
  });

  it('should read API keys from env', async () => {
    process.env.OPENAI_API_KEY = 'sk-test-key';
    process.env.GEMINI_API_KEY = 'gemini-test-key';

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.llm.providers.openai.apiKey).toBe('sk-test-key');
    expect(config.llm.providers.gemini.apiKey).toBe('gemini-test-key');
  });

  it('should read custom model names from env', async () => {
    process.env.OPENAI_MODEL = 'gpt-4-turbo';
    process.env.OLLAMA_MODEL = 'llama3:8b';

    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.llm.providers.openai.model).toBe('gpt-4-turbo');
    expect(config.llm.providers.ollama.model).toBe('llama3:8b');
  });

  it('updateLLMProvider should change default provider', async () => {
    delete process.env.LLM_PROVIDER;

    // loadConfig returns a fresh config object; updateLLMProvider mutates the cached one.
    // We need to use getConfig (which caches) then updateLLMProvider which mutates it.
    const { getConfig, updateLLMProvider } = await import('../src/config.js');
    const config = getConfig();

    expect(config.llm.defaultProvider).toBe('ollama');
    updateLLMProvider('openai');
    // getConfig returns the same cached object, so mutation is visible
    expect(getConfig().llm.defaultProvider).toBe('openai');
  });

  it('updateProviderConfig should merge partial config', async () => {
    const { getConfig, updateProviderConfig } = await import('../src/config.js');

    updateProviderConfig('openai', { apiKey: 'new-key', model: 'gpt-4o-mini' });

    const config = getConfig();
    expect(config.llm.providers.openai.apiKey).toBe('new-key');
    expect(config.llm.providers.openai.model).toBe('gpt-4o-mini');
    // baseUrl should remain unchanged
    expect(config.llm.providers.openai.baseUrl).toBe('https://api.openai.com');
  });

  it('should have all four providers configured', async () => {
    const { loadConfig } = await import('../src/config.js');
    const config = loadConfig();

    expect(config.llm.providers.ollama).toBeDefined();
    expect(config.llm.providers.openai).toBeDefined();
    expect(config.llm.providers.gemini).toBeDefined();
    expect(config.llm.providers.anthropic).toBeDefined();
  });
});
