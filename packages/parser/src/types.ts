// ============================================================
// Bugreport Metadata
// ============================================================

export interface BugreportMetadata {
  androidVersion: string;
  sdkLevel: number;
  buildFingerprint: string;
  buildType: string;           // "user" | "userdebug" | "eng" | "unknown"
  deviceModel: string;
  manufacturer: string;
  buildDate: string;
  bugreportTimestamp: Date;
  kernelVersion: string;
  // Hardware
  platform?: string;           // ro.board.platform (e.g., "lahaina", "yupik")
  hardware?: string;           // ro.hardware (e.g., "qcom")
  cpuAbi?: string;             // ro.product.cpu.abi (e.g., "arm64-v8a")
  serialNumber?: string;       // ro.boot.serialno
  // Software
  basebandVersion?: string;    // gsm.version.baseband (modem firmware)
  bootloaderVersion?: string;  // ro.bootimage.build.fingerprint (boot image)
  securityPatchLevel?: string; // ro.build.version.security_patch (e.g., "2025-04-05")
}

// ============================================================
// Unpacker
// ============================================================

export interface BugreportSection {
  name: string;
  command: string;
  content: string;
  startLine: number;
  endLine: number;
}

export interface LogcatSection {
  buffer: LogcatBuffer;
  content: string;
}

export interface UnpackResult {
  metadata: BugreportMetadata;
  sections: BugreportSection[];
  logcatSections: LogcatSection[];  // main, system, events, crash logcat with buffer info
  anrTraceFiles: string[];          // paths under FS/data/anr/
  tombstoneFiles: string[];         // paths under FS/data/tombstones/
  anrTraceContents: Map<string, string>;
  tombstoneContents: Map<string, string>;
  rawFiles: Map<string, Buffer>;    // all files in the zip
}

// ============================================================
// Logcat
// ============================================================

export type LogLevel = 'V' | 'D' | 'I' | 'W' | 'E' | 'F';

export type LogcatBuffer = 'main' | 'system' | 'events' | 'crash' | 'radio' | 'kernel';

export interface LogEntry {
  timestamp: string;   // "MM-DD HH:mm:ss.SSS"
  pid: number;
  tid: number;
  level: LogLevel;
  tag: string;
  message: string;
  raw: string;
  lineNumber: number;
  buffer?: LogcatBuffer;
}

export type LogcatAnomalyType =
  | 'anr'
  | 'fatal_exception'
  | 'oom'
  | 'binder_timeout'
  | 'slow_operation'
  | 'strict_mode'
  | 'watchdog'
  | 'native_crash'
  | 'system_server_crash'
  | 'input_dispatching_timeout'
  | 'hal_service_death';

export interface LogcatAnomaly {
  type: LogcatAnomalyType;
  severity: Severity;
  timestamp: string;
  entries: LogEntry[];     // related log entries
  processName?: string;
  pid?: number;
  summary: string;
}

export type TagClassification = 'vendor' | 'framework' | 'app';

export interface TagStat {
  tag: string;
  count: number;
  classification: TagClassification;
}

export interface LogcatParseResult {
  entries: LogEntry[];
  anomalies: LogcatAnomaly[];
  totalLines: number;
  parsedLines: number;
  parseErrors: number;
  tagStats?: TagStat[];
}

// ============================================================
// ANR Trace
// ============================================================

export type ThreadState =
  | 'Runnable'
  | 'Sleeping'
  | 'Waiting'
  | 'TimedWaiting'
  | 'Blocked'
  | 'Native'
  | 'Suspended'
  | 'Unknown';

export interface StackFrame {
  className: string;
  methodName: string;
  fileName: string;
  lineNumber: number;
  isNative: boolean;
  raw: string;
}

export interface LockInfo {
  address: string;       // "0x0a2b3c4d"
  className: string;     // "java.lang.Object"
  heldByTid?: number;    // thread tid that holds this lock
}

export interface ThreadInfo {
  name: string;
  priority: number;
  tid: number;
  state: ThreadState;
  daemon: boolean;
  sysTid?: number;
  nativeTid?: number;
  stackFrames: StackFrame[];
  waitingOnLock: LockInfo | null;
  heldLocks: LockInfo[];
  raw: string;
}

export type MainThreadBlockReason =
  | 'lock_contention'
  | 'deadlock'
  | 'io_on_main_thread'
  | 'network_on_main_thread'
  | 'slow_binder_call'
  | 'heavy_computation'
  | 'expensive_rendering'
  | 'broadcast_blocking'
  | 'slow_app_startup'
  | 'idle_main_thread'          // nativePollOnce
  | 'no_stack_frames'
  | 'system_overload_candidate'
  | 'binder_pool_exhaustion'
  | 'content_provider_slow'
  | 'consecutive_binder_calls'  // needs logcat
  | 'go_async_not_finished'     // needs logcat
  | 'oom_memory_pressure'       // needs kernel log
  | 'gpu_hang'
  | 'unknown';

export interface DeadlockCycle {
  threads: ThreadInfo[];
  locks: LockInfo[];
}

export interface LockGraphNode {
  tid: number;
  threadName: string;
  state: ThreadState;
}

export interface LockGraphEdge {
  from: number;          // tid waiting
  to: number;            // tid holding
  lockAddress: string;
  lockClassName: string;
}

export interface BinderTargetInfo {
  interfaceName: string;   // e.g. "ITrmbKeypad", "IGnss"
  packageName: string;     // e.g. "vendor.trimble.hardware.trmbkeypad@1.0"
  method: string;          // e.g. "getService", "start"
  callerClass: string;     // e.g. "com.trimble.libtrimblekeypad.KeypadService"
  callerMethod: string;    // e.g. "getKeypadService"
}

export type ThreadBlockAnalysis = {
  thread: ThreadInfo;
  blockReason: MainThreadBlockReason;
  blockingChain: ThreadInfo[];
  confidence: 'high' | 'medium' | 'low';
  /** Extracted binder/HAL target when blockReason is slow_binder_call */
  binderTarget?: BinderTargetInfo;
  /** HAL/binder targets found on OTHER threads (useful when main is idle) */
  suspectedBinderTargets?: Array<BinderTargetInfo & { threadName: string; threadState: string }>;
};

export interface ANRTraceAnalysis {
  pid: number;
  processName: string;
  timestamp?: string;
  /** Raw Subject line from ANR file, e.g. "Blocked in handler on foreground thread (android.fg) for 15s" */
  subject?: string;
  threads: ThreadInfo[];
  /** Analysis of main thread (tid=1) */
  mainThread: ThreadBlockAnalysis | null;
  /** Analysis of the actually blocked thread identified by Subject line (if different from main) */
  blockedThread?: ThreadBlockAnalysis | null;
  /** Name of the blocked thread from Subject line, e.g. "android.fg" */
  blockedThreadName?: string;
  lockGraph: {
    nodes: LockGraphNode[];
    edges: LockGraphEdge[];
  };
  deadlocks: {
    detected: boolean;
    cycles: DeadlockCycle[];
  };
  binderThreads: {
    total: number;
    busy: number;
    idle: number;
    exhausted: boolean;
  };
}

// ============================================================
// Kernel Log
// ============================================================

export type KernelEventType =
  | 'kernel_panic'
  | 'oom_kill'
  | 'lowmemory_killer'
  | 'driver_error'
  | 'thermal_shutdown'
  | 'thermal_throttling'
  | 'watchdog_reset'
  | 'selinux_denial'
  | 'gpu_error'
  | 'kswapd_active'
  | 'storage_io_error'
  | 'suspend_resume_error';

export interface KernelLogEntry {
  timestamp: number;     // seconds since boot
  level: string;         // kern level (e.g., "<3>", "<6>")
  facility: string;
  message: string;
  raw: string;
}

export interface KernelEvent {
  type: KernelEventType;
  severity: Severity;
  timestamp: number;
  entries: KernelLogEntry[];
  summary: string;
  details: Record<string, string | number>;
}

export interface KernelParseResult {
  entries: KernelLogEntry[];
  events: KernelEvent[];
  totalLines: number;
  parseErrors?: number;
}

// ============================================================
// Boot Status
// ============================================================

export interface BootStatusSummary {
  bootCompleted: boolean;
  bootReason?: string;
  systemServerRestarts: number;
  uptimeSeconds?: number;
}

// ============================================================
// Dumpsys meminfo / cpuinfo
// ============================================================

export interface MemInfoProcess {
  pid: number;
  processName: string;
  totalPssKb: number;
}

export interface MemInfoSummary {
  totalRamKb: number;
  freeRamKb: number;
  usedRamKb: number;
  topProcesses: MemInfoProcess[];  // top 10 by PSS
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
  topProcesses: CpuInfoProcess[];  // top 10 by CPU%
}

// ============================================================
// HAL Status (lshal)
// ============================================================

export interface HALService {
  interfaceName: string;   // e.g. "android.hardware.audio@6.0::IDevicesFactory/default"
  transport: string;       // "hwbinder" | "passthrough"
  arch?: string;           // "32" | "64" | "32+64"
  status: string;          // "alive" | "non-responsive" | "declared"
  isVendor: boolean;       // starts with "vendor."
}

export interface HALFamily {
  familyName: string;       // e.g. "vendor.display.color::IDisplayColor"
  shortName: string;        // e.g. "color"
  highestVersion: string;   // e.g. "1.4"
  highestStatus: string;    // status of the highest version: "alive" | "non-responsive" | "declared"
  isVendor: boolean;
  isOem: boolean;           // true if this is an OEM-specific HAL (vs BSP-bundled vendor HAL)
  versionCount: number;     // how many versions exist
}

export interface HALStatusSummary {
  totalServices: number;
  aliveCount: number;
  nonResponsiveCount: number;
  declaredCount: number;
  nonResponsiveServices: HALService[];  // only non-responsive ones
  declaredServices: HALService[];       // declared but not registered
  families: HALFamily[];                // all grouped families
  vendorIssueCount: number;             // families where highest version is non-responsive or declared (vendor only)
  truncated: boolean;                   // true if lshal output was truncated (killed by system)
}

// ============================================================
// Tombstone (Native Crash)
// ============================================================

export type NativeCrashSignal = 'SIGSEGV' | 'SIGABRT' | 'SIGBUS' | 'SIGFPE' | 'SIGILL' | 'SIGTRAP' | 'UNKNOWN';

export interface NativeStackFrame {
  frameNumber: number;       // #00, #01, ...
  pc: string;                // program counter hex value
  binary: string;            // /system/lib64/libc.so
  function?: string;         // symbol name
  offset?: number;           // function offset in bytes
  buildId?: string;          // build ID if present
  raw: string;               // original line
}

export interface TombstoneAnalysis {
  fileName: string;          // tombstone file path
  pid: number;
  tid: number;
  processName: string;
  threadName?: string;
  signal: number;            // signal number (11, 6, etc.)
  signalName: NativeCrashSignal;
  signalCode?: string;       // e.g. "SEGV_MAPERR", "SI_TKILL"
  faultAddr?: string;        // fault address hex
  abi?: string;              // "arm64", "arm", "x86_64", "x86"
  buildFingerprint?: string;
  timestamp?: string;
  backtrace: NativeStackFrame[];
  crashedInBinary?: string;  // top frame binary (e.g. "/vendor/lib64/hw/foo.so")
  isVendorCrash: boolean;    // crashed in /vendor/ or /odm/ path
  abortMessage?: string;     // abort message if SIGABRT
  registers?: Record<string, string>;
  summary: string;           // one-line crash summary
}

export interface TombstoneParseResult {
  analyses: TombstoneAnalysis[];
  totalFiles: number;
}

// ============================================================
// Basic Analyzer (Insights)
// ============================================================

export type Severity = 'critical' | 'warning' | 'info';

export type InsightCategory = 'anr' | 'crash' | 'memory' | 'kernel' | 'performance' | 'stability' | 'power' | 'telephony';

export interface InsightCard {
  id: string;
  severity: Severity;
  category: InsightCategory;
  title: string;                    // one-line summary
  description: string;              // detailed explanation (rule-based)
  relatedLogSnippet?: string;       // relevant log excerpt
  stackTrace?: string;              // relevant stack trace
  timestamp?: string;
  source: 'logcat' | 'anr' | 'kernel' | 'cross' | 'tombstone' | 'power' | 'telephony';
  suggestedAllowRule?: string;      // SELinux allow rule suggestion
  debugCommands?: string[];         // suggested debug commands
  deepAnalysis?: {                  // filled by LLM in Deep Analysis mode
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
  timestamp: string;                // normalized ISO timestamp or relative
  source: 'logcat' | 'anr' | 'kernel' | 'tombstone' | 'telephony';
  severity: Severity;
  label: string;
  details?: string;
  count?: number;                   // aggregated event count
  timeRange?: string;               // aggregated time range, e.g. "boot+3808s ~ boot+3902s"
  insightId?: string;               // linked InsightCard.id for navigation
}

export interface SystemHealthScore {
  overall: number;                  // 0-100
  breakdown: {
    stability: number;
    memory: number;
    responsiveness: number;
    kernel: number;
  };
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

export interface AnalysisResult {
  metadata: BugreportMetadata;
  insights: InsightCard[];
  timeline: TimelineEvent[];
  healthScore: SystemHealthScore;
  anrAnalyses: ANRTraceAnalysis[];
  logcatResult: LogcatParseResult;
  kernelResult: KernelParseResult;
  memInfo?: MemInfoSummary;
  cpuInfo?: CpuInfoSummary;
  bootStatus?: BootStatusSummary;
  halStatus?: HALStatusSummary;
  tombstoneAnalyses?: TombstoneAnalysis[];
  logTagStats?: TagStat[];
  deepAnalysisOverview?: DeepAnalysisOverview;
  powerStatus?: PowerParseResult;
  telephonyStatus?: TelephonyParseResult;
}

// ============================================================
// Power Management
// ============================================================

export interface ActiveWakeLock {
  type: string;       // PARTIAL_WAKE_LOCK, DOZE_WAKE_LOCK, etc.
  tag: string;        // e.g. "dream:doze"
  duration: string;
  uid: number;
  pid: number;
}

export interface SuspendBlocker {
  name: string;       // e.g. "PowerManagerService.WakeLocks"
  refCount: number;
}

export interface PowerManagerState {
  wakefulness: string;      // Awake | Dozing | Asleep
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
  inactiveTo: number;      // ms
  idleTo: number;          // ms — first deep idle
  idleFactor: number;
  maxIdleTo: number;       // ms
  lightIdleTo: number;     // ms
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

export interface ConnectivityStats {
  cellularActiveTimeMs: number;
  cellularDataRxBytes: number;
  cellularDataTxBytes: number;
  cellularSignalDistribution?: Array<{ level: string; percentage: number }>;
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

export interface TelephonyParseResult {
  serviceState?: ServiceStateSnapshot;
  signalStrength?: SignalStrengthSnapshot;
  oosEvents: OosEvent[];
  rilErrors: RilError[];
  callEvents: CallEvent[];
  smsEvents: SmsEvent[];
  ratChanges: RatChangeEvent[];
  simSlotCount: number;
}

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
  previousRat?: string;
}

export interface RilError {
  timestamp: string;
  errorType: 'modem_err' | 'timeout' | 'radio_crash' | 'ril_restart'
           | 'request_not_supported' | 'modem_restart' | 'radio_not_available';
  request?: string;
  errorCode?: number;
  message: string;
}

export interface CallEvent {
  timestamp: string;
  type: 'call_start' | 'call_end' | 'call_drop' | 'call_fail';
  number?: string;
  duration?: number;
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

// ============================================================
// LLM Gateway
// ============================================================

export interface LLMRequest {
  systemPrompt: string;
  userPrompt: string;
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  model: string;
  tokensUsed: {
    prompt: number;
    completion: number;
  };
}

export interface StreamChunk {
  content: string;
  done: boolean;
}

export type LLMProviderType = 'ollama' | 'openai' | 'gemini' | 'anthropic';

export interface LLMProviderConfig {
  type: LLMProviderType;
  baseUrl: string;
  model: string;
  apiKey?: string;
}

export interface ProviderStatus {
  type: LLMProviderType;
  available: boolean;
  model: string;
  error?: string;
}
