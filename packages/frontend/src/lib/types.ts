// Shared frontend types — mirrors the parser types needed by the UI.
// We duplicate a slim subset to avoid depending on the Node.js parser package.

export type Severity = 'critical' | 'warning' | 'info';
export type InsightCategory = 'anr' | 'crash' | 'memory' | 'kernel' | 'performance' | 'stability' | 'power' | 'telephony';

export interface InsightCard {
  id: string;
  severity: Severity;
  category: InsightCategory;
  title: string;
  description: string;
  relatedLogSnippet?: string;
  stackTrace?: string;
  timestamp?: string;
  source: 'logcat' | 'anr' | 'kernel' | 'cross' | 'tombstone' | 'power' | 'telephony';
  suggestedAllowRule?: string;
  debugCommands?: string[];
  deepAnalysis?: {
    rootCause: string;
    fixSuggestion: string;
    confidence: 'high' | 'medium' | 'low';
    evidence: string[];
    impactAssessment: string;
    debuggingSteps: string[];
    relatedInsights: string[];
    category: 'root_cause' | 'symptom' | 'contributing_factor';
    affectedComponents: string[];
  };
}

export interface TimelineEvent {
  timestamp: string;
  source: 'logcat' | 'anr' | 'kernel' | 'tombstone' | 'telephony' | 'clock';
  severity: Severity;
  label: string;
  details?: string;
  count?: number;
  timeRange?: string;
  insightId?: string;
}

export interface SystemHealthScore {
  overall: number;
  breakdown: {
    stability: number;
    memory: number;
    responsiveness: number;
    kernel: number;
  };
}

export interface BugreportMetadata {
  androidVersion: string;
  sdkLevel: number;
  buildFingerprint: string;
  buildType: string;           // "user" | "userdebug" | "eng" | "unknown"
  deviceModel: string;
  manufacturer: string;
  buildDate: string;
  bugreportTimestamp: string;
  kernelVersion: string;
  // Hardware
  platform?: string;
  hardware?: string;
  cpuAbi?: string;
  serialNumber?: string;
  // Software
  basebandVersion?: string;
  bootloaderVersion?: string;
  securityPatchLevel?: string;
}

export interface BinderTargetInfo {
  interfaceName: string;
  packageName: string;
  method: string;
  callerClass: string;
  callerMethod: string;
}

export interface ThreadBlockAnalysis {
  thread: {
    name: string;
    state: string;
    stackFrames: Array<{ raw: string; className: string; methodName: string }>;
  };
  blockReason: string;
  blockingChain: Array<{ name: string; tid: number; state: string }>;
  confidence: 'high' | 'medium' | 'low';
  binderTarget?: BinderTargetInfo;
  suspectedBinderTargets?: Array<BinderTargetInfo & { threadName: string; threadState: string }>;
}

export interface ANRTraceAnalysis {
  pid: number;
  processName: string;
  timestamp?: string;
  subject?: string;
  mainThread: ThreadBlockAnalysis | null;
  blockedThread?: ThreadBlockAnalysis | null;
  blockedThreadName?: string;
  lockGraph: {
    nodes: Array<{ tid: number; threadName: string; state: string }>;
    edges: Array<{ from: number; to: number; lockAddress: string; lockClassName: string }>;
  };
  deadlocks: {
    detected: boolean;
    cycles: Array<{
      threads: Array<{ name: string; tid: number }>;
      locks: Array<{ address: string; className: string }>;
    }>;
  };
  binderThreads: {
    total: number;
    busy: number;
    idle: number;
    exhausted: boolean;
  };
}

export interface MemInfoProcess {
  pid: number;
  processName: string;
  totalPssKb: number;
}

export interface MemInfoSummary {
  totalRamKb: number;
  freeRamKb: number;
  usedRamKb: number;
  topProcesses: MemInfoProcess[];
}

export interface CpuInfoProcess {
  pid: number;
  processName: string;
  cpuPercent: number;
}

export interface CpuInfoSummary {
  totalCpuPercent: number;
  userPercent: number;
  kernelPercent: number;
  ioWaitPercent: number;
  topProcesses: CpuInfoProcess[];
}

export interface BootStatusSummary {
  bootCompleted: boolean;
  bootReason?: string;
  systemServerRestarts: number;
  uptimeSeconds?: number;
}

export interface HALService {
  interfaceName: string;
  transport: string;
  arch?: string;
  status: string;
  isVendor: boolean;
}

export interface HALFamily {
  familyName: string;
  shortName: string;
  highestVersion: string;
  highestStatus: string;
  isVendor: boolean;
  isOem: boolean;
  versionCount: number;
}

export interface HALStatusSummary {
  totalServices: number;
  aliveCount: number;
  nonResponsiveCount: number;
  declaredCount: number;
  nonResponsiveServices: HALService[];
  declaredServices: HALService[];
  families: HALFamily[];
  vendorIssueCount: number;
  truncated: boolean;
}

export interface NativeStackFrame {
  frameNumber: number;
  pc: string;
  binary: string;
  function?: string;
  offset?: number;
  buildId?: string;
  raw: string;
}

export interface TombstoneAnalysis {
  fileName: string;
  pid: number;
  tid: number;
  processName: string;
  threadName?: string;
  signal: number;
  signalName: string;
  signalCode?: string;
  faultAddr?: string;
  abi?: string;
  buildFingerprint?: string;
  timestamp?: string;
  backtrace: NativeStackFrame[];
  crashedInBinary?: string;
  isVendorCrash: boolean;
  abortMessage?: string;
  summary: string;
}

export interface DeepAnalysisOverview {
  executiveSummary: string;
  systemDiagnosis: string;
  correlationFindings: Array<{
    description: string;
    insightIds: string[];
    confidence: 'high' | 'medium' | 'low';
  }>;
  prioritizedActions: Array<{
    action: string;
    reason: string;
    effort: 'low' | 'medium' | 'high';
    impact: 'low' | 'medium' | 'high';
  }>;
}

// ============================================================
// Power Management
// ============================================================

export interface ActiveWakeLock {
  type: string;
  tag: string;
  duration: string;
  uid: number;
  pid: number;
}

export interface SuspendBlocker {
  name: string;
  refCount: number;
}

export interface PowerManagerState {
  wakefulness: string;
  isPowered: boolean;
  plugType: number;
  batteryLevel: number;
  lastSleepReason: string;
  screenOffTimeout: number;
  useAutoSuspend: boolean;
  activeWakeLocks: ActiveWakeLock[];
  suspendBlockers: SuspendBlocker[];
  activeSuspendBlockerCount: number;
}

export interface DozeState {
  deepState: string;
  lightState: string;
  screenOn: boolean;
  charging: boolean;
  deepEnabled: boolean;
  lightEnabled: boolean;
}

export interface DozeSettings {
  inactiveTo: number;
  idleTo: number;
  idleFactor: number;
  maxIdleTo: number;
  lightIdleTo: number;
  lightMaxIdleTo: number;
  lightIdleFactor: number;
}

export interface BatteryStatsSummary {
  batteryCapacityMah: number;
  totalDischargeMah: number;
  screenOnTime: string;
  screenOnTimeMs: number;
  screenOffDischargeMah: number;
  deepDozeTime: string;
  deepDozeTimeMs: number;
  deepDozeDischargeMah: number;
  deepDozeDischargeRateMahPerHr: number;
  lightDozeTime: string;
  lightDozeTimeMs: number;
  partialWakelockTime: string;
  partialWakelockTimeMs: number;
  timePeriod: string;
  timePeriodMs: number;
}

export interface KernelWakeLockStat {
  name: string;
  count: number;
  totalTimeMs: number;
  avgTimeMs: number;
}

export interface AlarmWakeupStat {
  appName: string;
  uid: string;
  wakeupCount: number;
  runtimeMs: number;
  topAlarms: Array<{ name: string; count: number }>;
}

export interface SuspendStats {
  totalSuspendAttempts: number;
  suspendAbortCount: number;
  taskFreezeAbortCount: number;
  deviceSuspendFailureCount: number;
  suspendSuccessRate: number;
  suspendSuccessCount?: number;
  topAbortSources: Array<{ name: string; count: number; percentage: number }>;
  topWakeupSources: Array<{ name: string; count: number; percentage: number }>;
  lastFailedDev?: string;
  lastFailedStep?: string;
  lastFailedErrno?: number;
  source?: 'suspend_stats_section' | 'kernel_log' | 'merged';
}

export interface EstimatedPowerUse {
  components: Array<{ name: string; mah: number }>;
  topUids: Array<{ uid: string; name: string; mah: number }>;
  computedTotal: number;
  actualDrain?: { min: number; max: number };
}

export interface CellularRatEntry {
  rat: string;
  timeMs: number;
  percentage: number;
}

export interface ConnectivityStats {
  cellularActiveTimeMs: number;
  cellularDataRxBytes: number;
  cellularDataTxBytes: number;
  cellularSignalDistribution?: Array<{ level: string; percentage: number }>;
  cellularRatDistribution?: CellularRatEntry[];
  wifiActiveTimeMs: number;
  wifiDataRxBytes: number;
  wifiDataTxBytes: number;
  wifiSignalDistribution?: Array<{ level: string; percentage: number }>;
  bluetoothActiveTimeMs: number;
  gpsActiveTimeMs: number;
  connectivityChanges: number;
}

export interface PartialWakeLockStat {
  name: string;
  uid: string;
  ownerApp?: string;
  totalTimeMs: number;
  count: number;
}

export interface PowerParseResult {
  powerManagerState?: PowerManagerState;
  dozeState?: DozeState;
  dozeSettings?: DozeSettings;
  batteryStats?: BatteryStatsSummary;
  kernelWakeLocks: KernelWakeLockStat[];
  alarmWakeups?: AlarmWakeupStat[];
  suspendStats?: SuspendStats;
  estimatedPowerUse?: EstimatedPowerUse;
  connectivityStats?: ConnectivityStats;
  partialWakeLocks?: PartialWakeLockStat[];
}

// ============================================================
// Telephony
// ============================================================

export interface ServiceStateSnapshot {
  slotId: number;
  voiceState: 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'EMERGENCY_ONLY' | 'POWER_OFF';
  dataState: 'IN_SERVICE' | 'OUT_OF_SERVICE' | 'EMERGENCY_ONLY' | 'POWER_OFF';
  operator?: string;
  mccMnc?: string;
  rat?: string;
  roaming: boolean;
}

export interface SignalStrengthSnapshot {
  slotId: number;
  technology: 'WCDMA' | 'LTE' | 'NR' | 'GSM' | 'CDMA';
  rsrp?: number;
  rsrq?: number;
  sinr?: number;
  rscp?: number;
  ecno?: number;
  rssi?: number;
  level: number;
}

export interface OosEvent {
  timestamp: string;
  type: 'oos_start' | 'oos_end';
  domain: 'voice' | 'data' | 'both';
  durationMs?: number;
}

export interface RilError {
  timestamp: string;
  errorType: 'modem_err' | 'timeout' | 'radio_crash' | 'ril_restart'
           | 'request_not_supported' | 'modem_restart' | 'radio_not_available';
  request?: string;
  message: string;
}

export interface CallEvent {
  timestamp: string;
  type: 'call_start' | 'call_end' | 'call_drop' | 'call_fail';
  failReason?: string;
}

export interface SmsEvent {
  timestamp: string;
  type: 'sms_send_success' | 'sms_send_fail' | 'sms_receive';
  failReason?: string;
}

export interface RatChangeEvent {
  timestamp: string;
  fromRat: string;
  toRat: string;
}

export interface DumpsysOosPeriod {
  start: string;
  end?: string;
  durationMs?: number;
}

export type SimState = 'ABSENT' | 'NOT_READY' | 'READY' | 'LOADED' | 'UNKNOWN' | 'ERROR';

export interface TransportError {
  timestamp: string;
  type: 'enodev' | 'device_gone' | 'transport_read_error';
  message: string;
}

export interface TelephonyParseResult {
  serviceState?: ServiceStateSnapshot;
  signalStrength?: SignalStrengthSnapshot;
  oosEvents: OosEvent[];
  rilErrors: RilError[];
  callEvents: CallEvent[];
  smsEvents: SmsEvent[];
  ratChanges: RatChangeEvent[];
  simSlotCount: number;
  simState?: SimState;
  dumpsysOosPeriods?: DumpsysOosPeriod[];
  modemRestartCount?: number;
  modemRestartReasons?: string[];
  transportErrors?: TransportError[];
  radioLogTimeRange?: { start: string; end: string };
  dataNetworkOosPeriods?: DataNetworkOosPeriod[];
}

export interface DataNetworkOosPeriod {
  disconnectedAt: string;
  connectedAt?: string;
  durationMs?: number;
  cause?: string;
  networkId?: string;
}

export interface ClockJump {
  entryIndex: number;
  fromTimestamp: string;
  toTimestamp: string;
  jumpMinutes: number;
}

export interface ClockCorrectionResult {
  jumps: ClockJump[];
  lastCorrectionIndex: number;
  preCorrectionCount: number;
}

export interface AnalysisResult {
  metadata: BugreportMetadata;
  insights: InsightCard[];
  timeline: TimelineEvent[];
  healthScore: SystemHealthScore;
  anrAnalyses: ANRTraceAnalysis[];
  memInfo?: MemInfoSummary;
  cpuInfo?: CpuInfoSummary;
  bootStatus?: BootStatusSummary;
  halStatus?: HALStatusSummary;
  tombstoneAnalyses?: TombstoneAnalysis[];
  logTagStats?: TagStat[];
  deepAnalysisOverview?: DeepAnalysisOverview;
  powerStatus?: PowerParseResult;
  telephonyStatus?: TelephonyParseResult;
  clockCorrection?: ClockCorrectionResult;
  bufferTimeRanges?: BufferTimeRange[];
}

export interface BufferTimeRange {
  buffer: string;
  firstTimestamp: string;
  lastTimestamp: string;
  entryCount: number;
}

// SSE progress from backend
export interface SSEProgress {
  stage: 'unpacking' | 'parsing' | 'analyzing' | 'deep_analysis' | 'complete' | 'error';
  progress: number;
  message: string;
  data?: AnalysisResult | { chunk: string; done: boolean };
}

export interface UploadResponse {
  id: string;
  filename: string;
  size: number;
}

export type TagClassification = 'vendor' | 'framework' | 'app';

export interface TagStat {
  tag: string;
  count: number;
  classification: TagClassification;
}

export type AnalysisMode = 'quick' | 'deep';

export const QUICK_TAGS = ['ANR', 'Crash', 'Reboot', 'Battery', 'Jank', 'OOM'] as const;
export type QuickTag = typeof QUICK_TAGS[number];

export interface AnalysisSummary {
  id: string;
  filename: string;
  fileSize: number;
  createdAt: string;
  deviceModel?: string;
  manufacturer?: string;
  androidVer?: string;
  healthOverall?: number;
  insightCount: number;
  criticalCount: number;
  anrCount: number;
  hasDeepAnalysis?: boolean;
  notes?: string;
  tags?: string;
}

// ---- Batch Analysis Types ----

export interface CommonIssue {
  title: string;
  category: string;
  severity: Severity;
  count: number;
  deviceModels: string[];
}

export interface DeviceDistribution {
  model: string;
  manufacturer: string;
  count: number;
  avgHealthScore: number;
}

export interface BatchAggregation {
  totalReports: number;
  avgHealthScore: number;
  healthRange: { min: number; max: number };
  commonIssues: CommonIssue[];
  deviceDistribution: DeviceDistribution[];
  criticalCount: number;
  warningCount: number;
  anrProcesses: Array<{ processName: string; count: number }>;
}

export interface BatchUploadResponse {
  batchId: string;
  files: Array<{ id: string; filename: string; size: number }>;
  count: number;
}

export interface BatchFileResult {
  id: string;
  filename: string;
  healthScore: number;
  insightCount: number;
  criticalCount: number;
}

export interface BatchSSEProgress {
  stage: 'analyzing' | 'complete' | 'error';
  progress: number;
  message: string;
  fileIndex?: number;
  totalFiles?: number;
  fileResult?: BatchFileResult;
  fileError?: { filename: string; error: string };
  data?: {
    batchId: string;
    aggregation: BatchAggregation;
    items: BatchFileResult[];
  };
}
