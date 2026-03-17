import { useState, useEffect } from 'react';
import { BatchAggregation, BatchFileResult } from '../lib/types';

interface Props {
  aggregation: BatchAggregation;
  items: BatchFileResult[];
  onViewReport: (id: string) => void;
  onClose: () => void;
}

function severityBadge(severity: string): string {
  switch (severity) {
    case 'critical': return 'bg-red-900/50 text-red-300 border-red-700/50';
    case 'warning': return 'bg-yellow-900/50 text-yellow-300 border-yellow-700/50';
    case 'info': return 'bg-blue-900/50 text-blue-300 border-blue-700/50';
    default: return 'bg-gray-800 text-gray-300 border-gray-700';
  }
}

function scoreColor(score: number): string {
  if (score >= 70) return 'text-green-400';
  if (score >= 40) return 'text-yellow-400';
  return 'text-red-400';
}

function scoreBg(score: number): string {
  if (score >= 70) return 'bg-green-500';
  if (score >= 40) return 'bg-yellow-500';
  return 'bg-red-500';
}

export default function BatchResults({ aggregation, items, onViewReport, onClose }: Props) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  const handleClose = () => {
    setVisible(false);
    setTimeout(onClose, 200);
  };

  const {
    totalReports,
    avgHealthScore,
    healthRange,
    commonIssues,
    deviceDistribution,
    criticalCount,
    warningCount,
    anrProcesses,
  } = aggregation;

  return (
    <div
      className={`fixed inset-0 z-50 flex items-start justify-center overflow-y-auto py-8 transition-colors duration-200 ${visible ? 'bg-black/60' : 'bg-black/0'}`}
      onClick={handleClose}
    >
      <div
        className={`w-full max-w-5xl bg-background border border-border rounded-xl shadow-2xl mx-4 transition-all duration-200 ${visible ? 'opacity-100 scale-100' : 'opacity-0 scale-95'}`}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-gray-100">
            Batch Analysis Results
          </h2>
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white text-xl leading-none"
          >
            &times;
          </button>
        </div>

        <div className="p-6 space-y-6">
          {/* Summary Cards */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div className="bg-surface border border-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-gray-100">{totalReports}</div>
              <div className="text-xs text-gray-400 mt-1">Total Reports</div>
            </div>
            <div className="bg-surface border border-border rounded-lg p-4 text-center">
              <div className={`text-2xl font-bold ${scoreColor(avgHealthScore)}`}>
                {avgHealthScore}
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Avg Health Score ({healthRange.min}-{healthRange.max})
              </div>
            </div>
            <div className="bg-surface border border-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-red-400">{criticalCount}</div>
              <div className="text-xs text-gray-400 mt-1">Critical Issues</div>
            </div>
            <div className="bg-surface border border-border rounded-lg p-4 text-center">
              <div className="text-2xl font-bold text-yellow-400">{warningCount}</div>
              <div className="text-xs text-gray-400 mt-1">Warnings</div>
            </div>
          </div>

          {/* Individual Reports */}
          {items.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Individual Reports
              </h3>
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="py-2 px-3 text-left">Filename</th>
                      <th className="py-2 px-3 text-center">Health</th>
                      <th className="py-2 px-3 text-center">Insights</th>
                      <th className="py-2 px-3 text-center">Critical</th>
                      <th className="py-2 px-3 text-center">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {items.map((item) => (
                      <tr key={item.id} className="border-t border-border hover:bg-surface-hover">
                        <td className="py-2 px-3 text-gray-200 truncate max-w-xs" title={item.filename}>
                          {item.filename}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <div className="w-16 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className={`h-full rounded-full ${scoreBg(item.healthScore)}`}
                                style={{ width: `${item.healthScore}%` }}
                              />
                            </div>
                            <span className={`text-xs font-medium ${scoreColor(item.healthScore)}`}>
                              {item.healthScore}
                            </span>
                          </div>
                        </td>
                        <td className="py-2 px-3 text-center text-gray-300">{item.insightCount}</td>
                        <td className="py-2 px-3 text-center">
                          {item.criticalCount > 0 ? (
                            <span className="text-red-400 font-medium">{item.criticalCount}</span>
                          ) : (
                            <span className="text-gray-500">0</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-center">
                          <button
                            onClick={() => onViewReport(item.id)}
                            className="text-xs text-accent hover:text-accent-light transition-colors"
                          >
                            View
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Common Issues */}
          {commonIssues.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Common Issues (across reports)
              </h3>
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="py-2 px-3 text-left">Issue</th>
                      <th className="py-2 px-3 text-center">Severity</th>
                      <th className="py-2 px-3 text-center">Count</th>
                      <th className="py-2 px-3 text-left">Affected Devices</th>
                    </tr>
                  </thead>
                  <tbody>
                    {commonIssues.map((issue, i) => (
                      <tr key={i} className="border-t border-border">
                        <td className="py-2 px-3 text-gray-200 max-w-xs">
                          <div className="truncate" title={issue.title}>{issue.title}</div>
                          <div className="text-xs text-gray-500">{issue.category}</div>
                        </td>
                        <td className="py-2 px-3 text-center">
                          <span className={`text-xs px-1.5 py-0.5 rounded border ${severityBadge(issue.severity)}`}>
                            {issue.severity}
                          </span>
                        </td>
                        <td className="py-2 px-3 text-center text-gray-300 font-medium">
                          {issue.count}/{totalReports}
                        </td>
                        <td className="py-2 px-3 text-gray-400 text-xs">
                          {issue.deviceModels.join(', ')}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* Device Distribution */}
          {deviceDistribution.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                Device Distribution
              </h3>
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="py-2 px-3 text-left">Model</th>
                      <th className="py-2 px-3 text-left">Manufacturer</th>
                      <th className="py-2 px-3 text-center">Reports</th>
                      <th className="py-2 px-3 text-center">Avg Health</th>
                    </tr>
                  </thead>
                  <tbody>
                    {deviceDistribution.map((device) => (
                      <tr key={device.model} className="border-t border-border">
                        <td className="py-2 px-3 text-gray-200 font-medium">{device.model}</td>
                        <td className="py-2 px-3 text-gray-400">{device.manufacturer}</td>
                        <td className="py-2 px-3 text-center text-gray-300">{device.count}</td>
                        <td className={`py-2 px-3 text-center font-medium ${scoreColor(device.avgHealthScore)}`}>
                          {device.avgHealthScore}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}

          {/* ANR Process Frequency */}
          {anrProcesses.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold text-gray-400 uppercase tracking-wider mb-3">
                ANR Process Frequency
              </h3>
              <div className="bg-surface border border-border rounded-lg overflow-hidden">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-gray-400 text-xs uppercase">
                      <th className="py-2 px-3 text-left">Process</th>
                      <th className="py-2 px-3 text-center">Occurrences</th>
                      <th className="py-2 px-3 text-left">Frequency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {anrProcesses.map((proc) => (
                      <tr key={proc.processName} className="border-t border-border">
                        <td className="py-2 px-3 text-gray-200 font-mono text-xs">{proc.processName}</td>
                        <td className="py-2 px-3 text-center text-gray-300">{proc.count}</td>
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-2">
                            <div className="w-24 h-1.5 bg-gray-700 rounded-full overflow-hidden">
                              <div
                                className="h-full bg-orange-500 rounded-full"
                                style={{ width: `${Math.round((proc.count / totalReports) * 100)}%` }}
                              />
                            </div>
                            <span className="text-xs text-gray-400">
                              {Math.round((proc.count / totalReports) * 100)}%
                            </span>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-border flex justify-end">
          <button
            onClick={handleClose}
            className="px-4 py-2 text-sm border border-border rounded-lg hover:bg-surface-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
