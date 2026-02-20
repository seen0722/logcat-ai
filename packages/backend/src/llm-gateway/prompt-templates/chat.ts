import { AnalysisResult } from '@logcat-ai/parser';

export interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
}

export function buildChatPrompt(
  result: AnalysisResult,
  messages: ChatMessage[]
): { systemPrompt: string; userPrompt: string } {
  const systemPrompt = `You are an expert Android system engineer helping analyze a bugreport.
You have already performed an analysis on this bugreport. The user is now asking follow-up questions.

Context from the analysis:
- Device: ${result.metadata.deviceModel} (Android ${result.metadata.androidVersion})
- Health Score: ${result.healthScore.overall}/100
- Key Issues Found: ${result.insights.slice(0, 5).map((i) => i.title).join('; ')}
- ANR Processes: ${result.anrAnalyses.map((a) => {
    const primary = a.blockedThread ?? a.mainThread;
    const thread = a.blockedThreadName ?? 'main';
    const reason = primary?.blockReason ?? 'unknown';
    const target = primary?.binderTarget?.interfaceName;
    return `${a.processName} (thread="${thread}", ${reason}${target ? `, target=${target}` : ''})`;
  }).join('; ') || 'none'}

Rules:
- Answer concisely but technically.
- Reference specific data from the analysis when relevant.
- If the user asks about something not in the bugreport, say so clearly.
- You can suggest additional debugging steps if needed.`;

  // Build conversation history into a single user prompt
  // (keeps compatible with single-turn LLM APIs)
  const history = messages
    .slice(0, -1) // all except last
    .map((m) => `${m.role === 'user' ? 'User' : 'Assistant'}: ${m.content}`)
    .join('\n\n');

  const lastMessage = messages[messages.length - 1];
  let userPrompt = '';
  if (history) {
    userPrompt += `Previous conversation:\n${history}\n\n`;
  }
  userPrompt += lastMessage.content;

  return { systemPrompt, userPrompt };
}
