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
- Insights (${result.insights.length} total):
${result.insights.map((i) => `  [${i.severity}] ${i.id}: ${i.title}`).join('\n')}
- ANR Processes: ${result.anrAnalyses.map((a) => {
    const primary = a.blockedThread ?? a.mainThread;
    const thread = a.blockedThreadName ?? 'main';
    const reason = primary?.blockReason ?? 'unknown';
    const target = primary?.binderTarget?.interfaceName;
    return `${a.processName} (thread="${thread}", ${reason}${target ? `, target=${target}` : ''})`;
  }).join('; ') || 'none'}
${(() => {
    if (result.logTagStats && result.logTagStats.length > 0) {
      const layerCounts = { vendor: 0, framework: 0, app: 0 };
      for (const ts of result.logTagStats) {
        layerCounts[ts.classification] += ts.count;
      }
      const total = layerCounts.vendor + layerCounts.framework + layerCounts.app;
      if (total > 0) {
        const pct = (n: number) => ((n / total) * 100).toFixed(0);
        return `- Error Distribution: vendor ${pct(layerCounts.vendor)}%, framework ${pct(layerCounts.framework)}%, app ${pct(layerCounts.app)}%`;
      }
    }
    return '';
  })()}
${(() => {
    if (result.halStatus && result.halStatus.families.length > 0) {
      const hal = result.halStatus;
      const aliveFamilies = hal.families.filter((f) => f.highestStatus === 'alive').length;
      return `- HAL Status: ${aliveFamilies}/${hal.families.length} families alive, ${hal.vendorIssueCount} vendor issues`;
    }
    return '';
  })()}
${result.tombstoneAnalyses && result.tombstoneAnalyses.length > 0
    ? `- Native Crashes: ${result.tombstoneAnalyses.map(t =>
        `${t.signalName} in ${t.processName} (${t.crashedInBinary ?? 'unknown'})`
      ).join('; ')}`
    : ''}

Rules:
- Answer concisely but technically.
- Reference specific data from the analysis when relevant.
- If the user asks about something not in the bugreport, say so clearly.
- You can suggest additional debugging steps if needed.
- When discussing vendor/HAL/BSP issues, provide BSP-specific guidance including HAL daemon state, dmesg correlation, and SELinux context.`;

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
