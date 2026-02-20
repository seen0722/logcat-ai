import { Router, Request, Response } from 'express';
import { LLMProviderType } from '@logcat-ai/parser';
import {
  listProviders,
  switchProvider,
  getActiveProviderType,
} from '../llm-gateway/llm-gateway.js';
import { updateProviderConfig } from '../config.js';

const router = Router();

/**
 * GET /api/settings/providers
 * List all LLM providers and their status.
 */
router.get('/providers', async (_req: Request, res: Response) => {
  const providers = await listProviders();
  const active = getActiveProviderType();
  res.json({ active, providers });
});

/**
 * PUT /api/settings/provider
 * Switch the active LLM provider.
 * Body: { type: LLMProviderType, apiKey?: string, model?: string, baseUrl?: string }
 */
router.put('/provider', (req: Request, res: Response) => {
  const { type, apiKey, model, baseUrl } = req.body as {
    type: LLMProviderType;
    apiKey?: string;
    model?: string;
    baseUrl?: string;
  };

  const validTypes: LLMProviderType[] = ['ollama', 'openai', 'gemini', 'anthropic'];
  if (!type || !validTypes.includes(type)) {
    return res.status(400).json({
      error: `Invalid provider type. Must be one of: ${validTypes.join(', ')}`,
    });
  }

  // Update provider config if additional fields are given
  if (apiKey || model || baseUrl) {
    updateProviderConfig(type, {
      ...(apiKey ? { apiKey } : {}),
      ...(model ? { model } : {}),
      ...(baseUrl ? { baseUrl } : {}),
    });
  }

  switchProvider(type);

  res.json({ active: type, message: `Switched to ${type}` });
});

export default router;
