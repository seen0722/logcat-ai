import { Router, Request, Response } from 'express';
import { analysisStore } from '../store.js';
import { chatWithTools, ChatMessage } from '../llm-gateway/llm-gateway.js';

const router = Router();

/**
 * POST /api/chat/:id
 * Send a follow-up question about an analyzed bugreport.
 * Body: { messages: ChatMessage[] }
 * Streams response via SSE, including tool_call / tool_result events
 * when the LLM uses investigation tools.
 */
router.post('/:id', async (req: Request, res: Response) => {
  const id = String(req.params.id);
  const { messages } = req.body as { messages: ChatMessage[] };

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    return res.status(400).json({ error: 'messages array is required' });
  }

  const analysisResult = analysisStore.get(id);
  if (!analysisResult) {
    return res.status(404).json({ error: 'Analysis not found. Run /api/analyze/:id first.' });
  }

  // SSE for streaming response
  res.writeHead(200, {
    'Content-Type': 'text/event-stream',
    'Cache-Control': 'no-cache',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  let aborted = false;
  res.on('close', () => { aborted = true; });

  try {
    for await (const chunk of chatWithTools(id, analysisResult, messages)) {
      if (aborted) return;

      if (chunk.toolCall) {
        // Tool call event — tell the frontend which tool is being invoked
        res.write(`data: ${JSON.stringify({
          type: 'tool_call',
          name: chunk.toolCall.name,
          args: chunk.toolCall.args,
        })}\n\n`);
      } else if (chunk.toolResult) {
        // Tool result event — send a preview of the result
        res.write(`data: ${JSON.stringify({
          type: 'tool_result',
          name: chunk.toolResult.name,
          preview: chunk.toolResult.content,
        })}\n\n`);
      } else {
        // Regular content chunk
        res.write(`data: ${JSON.stringify({ content: chunk.content, done: chunk.done })}\n\n`);
      }
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Unknown error';
    console.error('[chat] Error:', msg);
    res.write(`data: ${JSON.stringify({ content: `\n\n[Error: ${msg}]`, done: true })}\n\n`);
  } finally {
    res.end();
  }
});

export default router;
