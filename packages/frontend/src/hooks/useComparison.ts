import { useState, useCallback } from 'react';

export interface HealthDiffItem {
  left: number;
  right: number;
  delta: number;
}

export interface ComparisonInsight {
  id: string;
  title: string;
  severity: string;
  category: string;
  source: string;
  description: string;
}

export interface HALChange {
  familyName: string;
  leftStatus: string;
  rightStatus: string;
}

export interface MetadataSummary {
  deviceModel: string;
  manufacturer: string;
  androidVersion: string;
  buildType: string;
  buildFingerprint: string;
  bugreportTimestamp?: string;
  serialNumber?: string;
  securityPatchLevel?: string;
  basebandVersion?: string;
}

export interface PowerDiff {
  present: boolean;
  dozeRateMahPerHr?: HealthDiffItem;
  suspendSuccessPercent?: HealthDiffItem;
  deepDozePercent?: HealthDiffItem;
  totalDischargeMah?: HealthDiffItem;
}

export interface TelephonyDiff {
  present: boolean;
  totalOosMs?: HealthDiffItem;
  oosPercentage?: HealthDiffItem;
  rilErrorCount?: HealthDiffItem;
  modemRestartCount?: HealthDiffItem;
  signalLevel?: HealthDiffItem;
}

export interface ComparisonResult {
  leftId: string;
  rightId: string;
  metadataDiff: {
    left: MetadataSummary;
    right: MetadataSummary;
  };
  healthDiff: {
    overall: HealthDiffItem;
    stability: HealthDiffItem;
    memory: HealthDiffItem;
    responsiveness: HealthDiffItem;
    kernel: HealthDiffItem;
  };
  insightDiff: {
    resolved: ComparisonInsight[];
    newIssues: ComparisonInsight[];
    persistent: ComparisonInsight[];
  };
  anrDiff: {
    resolved: string[];
    newIssues: string[];
    persistent: string[];
  };
  halDiff: {
    changes: HALChange[];
  };
  powerDiff: PowerDiff;
  telephonyDiff: TelephonyDiff;
}

export function useComparison() {
  const [comparison, setComparison] = useState<ComparisonResult | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const compare = useCallback(async (leftId: string, rightId: string) => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/compare?left=${encodeURIComponent(leftId)}&right=${encodeURIComponent(rightId)}`);
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: 'Compare failed' }));
        throw new Error(body.error ?? 'Compare failed');
      }
      const data: ComparisonResult = await res.json();
      setComparison(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Compare failed');
    } finally {
      setLoading(false);
    }
  }, []);

  const reset = useCallback(() => {
    setComparison(null);
    setError(null);
  }, []);

  return { comparison, loading, error, compare, reset };
}
