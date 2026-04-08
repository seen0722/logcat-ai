import { AnalysisResult } from '@logcat-ai/parser';
import { getDatabase } from './db.js';

export interface AnalysisSummary {
  id: string;
  filename: string;
  fileSize: number;
  createdAt: string;
  deviceModel?: string;
  manufacturer?: string;
  androidVer?: string;
  buildType?: string;
  isDebuggable?: boolean;
  isAdbSecure?: boolean;
  healthOverall?: number;
  insightCount: number;
  criticalCount: number;
  anrCount: number;
  hasDeepAnalysis?: boolean;
  notes?: string;
  tags?: string;
}

export const historyStore = {
  /**
   * Save an analysis result to the database.
   * Extracts denormalized summary fields from the AnalysisResult.
   */
  save(id: string, filename: string, fileSize: number, result: AnalysisResult): void {
    const db = getDatabase();

    const deviceModel = result.metadata?.deviceModel ?? null;
    const manufacturer = result.metadata?.manufacturer ?? null;
    const androidVer = result.metadata?.androidVersion ?? null;
    const buildType = result.metadata?.buildType ?? null;
    const isDebuggable = result.metadata?.isDebuggable ? 1 : 0;
    const isAdbSecure = result.metadata?.isAdbSecure ? 1 : 0;
    const healthOverall = result.healthScore?.overall ?? null;
    const insightCount = result.insights?.length ?? 0;
    const criticalCount = result.insights?.filter((i) => i.severity === 'critical').length ?? 0;
    const anrCount = result.anrAnalyses?.length ?? 0;
    // Strip raw entries before serializing — they can be 200MB+ for large bugreports
    // and are already stored in FTS5 index + rawDataStore for search/chat access.
    const slim = {
      ...result,
      logcatResult: result.logcatResult
        ? {
            anomalies: result.logcatResult.anomalies,
            totalLines: result.logcatResult.totalLines,
            parsedLines: result.logcatResult.parsedLines,
            parseErrors: result.logcatResult.parseErrors,
            tagStats: result.logcatResult.tagStats,
          }
        : undefined,
      kernelResult: result.kernelResult
        ? {
            events: result.kernelResult.events,
            totalLines: result.kernelResult.totalLines,
            parseErrors: result.kernelResult.parseErrors,
          }
        : undefined,
    };
    const resultJson = JSON.stringify(slim);

    const hasDeep = result.deepAnalysisOverview ? 1 : 0;

    const stmt = db.prepare(`
      INSERT OR REPLACE INTO analyses
        (id, filename, file_size, device_model, manufacturer, android_ver,
         build_type, is_debuggable, is_adb_secure,
         health_overall, insight_count, critical_count, anr_count, has_deep, result_json)
      VALUES
        (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, filename, fileSize, deviceModel, manufacturer, androidVer,
      buildType, isDebuggable, isAdbSecure,
      healthOverall, insightCount, criticalCount, anrCount, hasDeep, resultJson);
  },

  /**
   * Get the full AnalysisResult for a given id.
   */
  get(id: string): AnalysisResult | undefined {
    const db = getDatabase();
    const row = db.prepare('SELECT result_json FROM analyses WHERE id = ?').get(id) as
      { result_json: string } | undefined;

    if (!row) return undefined;

    try {
      return JSON.parse(row.result_json) as AnalysisResult;
    } catch {
      return undefined;
    }
  },

  /**
   * List analysis history with pagination.
   * Returns summary rows (without result_json) and total count.
   */
  list(limit = 20, offset = 0): { items: AnalysisSummary[]; total: number } {
    const db = getDatabase();

    const countRow = db.prepare('SELECT COUNT(*) as cnt FROM analyses').get() as { cnt: number };
    const total = countRow.cnt;

    const rows = db.prepare(`
      SELECT id, filename, file_size, created_at, device_model, manufacturer,
             android_ver, build_type, is_debuggable, is_adb_secure,
             health_overall, insight_count, critical_count, anr_count,
             has_deep, notes, tags
      FROM analyses
      ORDER BY created_at DESC
      LIMIT ? OFFSET ?
    `).all(limit, offset) as Array<{
      id: string;
      filename: string;
      file_size: number;
      created_at: string;
      device_model: string | null;
      manufacturer: string | null;
      android_ver: string | null;
      build_type: string | null;
      is_debuggable: number | null;
      is_adb_secure: number | null;
      health_overall: number | null;
      insight_count: number;
      critical_count: number;
      anr_count: number;
      has_deep: number | null;
      notes: string | null;
      tags: string | null;
    }>;

    const items: AnalysisSummary[] = rows.map((row) => ({
      id: row.id,
      filename: row.filename,
      fileSize: row.file_size,
      createdAt: row.created_at,
      deviceModel: row.device_model ?? undefined,
      manufacturer: row.manufacturer ?? undefined,
      androidVer: row.android_ver ?? undefined,
      buildType: row.build_type ?? undefined,
      isDebuggable: row.is_debuggable === 1,
      isAdbSecure: row.is_adb_secure === 1,
      healthOverall: row.health_overall ?? undefined,
      insightCount: row.insight_count,
      criticalCount: row.critical_count,
      anrCount: row.anr_count,
      hasDeepAnalysis: row.has_deep === 1,
      notes: row.notes ?? undefined,
      tags: row.tags ?? undefined,
    }));

    return { items, total };
  },

  /**
   * Delete an analysis record by id.
   * Returns true if a row was deleted.
   */
  delete(id: string): boolean {
    const db = getDatabase();
    const result = db.prepare('DELETE FROM analyses WHERE id = ?').run(id);
    return result.changes > 0;
  },

  /**
   * Update notes and optionally tags for an analysis.
   * Returns true if a row was updated.
   */
  updateNotes(id: string, notes: string, tags?: string): boolean {
    const db = getDatabase();
    const result = db.prepare(
      'UPDATE analyses SET notes = ?, tags = ? WHERE id = ?'
    ).run(notes, tags ?? null, id);
    return result.changes > 0;
  },
};
