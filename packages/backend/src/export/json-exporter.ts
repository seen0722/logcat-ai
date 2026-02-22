import { AnalysisResult } from '@logcat-ai/parser';

export function exportAsJSON(result: AnalysisResult): string {
  return JSON.stringify(result, null, 2);
}
