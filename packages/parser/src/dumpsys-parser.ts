import { MemInfoSummary, MemInfoProcess, CpuInfoSummary, CpuInfoProcess, HALStatusSummary, HALService, HALFamily } from './types.js';

/**
 * Parse `dumpsys meminfo` system-level summary.
 *
 * Looks for:
 * - `Total RAM: XXX,XXXK` / `Free RAM: XXX,XXXK` / `Used RAM: XXX,XXXK`
 * - `Total PSS by process:` block with lines like `    312,456K: com.android.systemui (pid 1234)`
 */
export function parseMemInfo(content: string): MemInfoSummary {
  const result: MemInfoSummary = {
    totalRamKb: 0,
    freeRamKb: 0,
    usedRamKb: 0,
    topProcesses: [],
  };

  if (!content) return result;

  // Parse RAM summary lines
  // Format: "Total RAM: 5,832,568K (status normal)"
  const totalMatch = content.match(/Total\s+RAM:\s*([\d,]+)K/i);
  if (totalMatch) result.totalRamKb = parseKbValue(totalMatch[1]);

  const freeMatch = content.match(/Free\s+RAM:\s*([\d,]+)K/i);
  if (freeMatch) result.freeRamKb = parseKbValue(freeMatch[1]);

  const usedMatch = content.match(/Used\s+RAM:\s*([\d,]+)K/i);
  if (usedMatch) result.usedRamKb = parseKbValue(usedMatch[1]);

  // Parse "Total PSS by process:" section
  // Each line format: "    312,456K: com.android.systemui (pid 1234)"
  //               or: "    312,456K: com.android.systemui (pid 1234 / activities)"
  const pssSection = content.match(/Total PSS by process:\s*\n([\s\S]*?)(?:\n\s*\n|\nTotal PSS by (?:OOM|category))/i);
  if (pssSection) {
    const lines = pssSection[1].split('\n');
    const processes: MemInfoProcess[] = [];

    for (const line of lines) {
      const match = line.match(/^\s*([\d,]+)K:\s*(.+?)\s*\(pid\s+(\d+)/);
      if (match) {
        processes.push({
          totalPssKb: parseKbValue(match[1]),
          processName: match[2].trim(),
          pid: parseInt(match[3], 10),
        });
      }
    }

    // Already sorted by PSS descending in dumpsys output, take top 10
    result.topProcesses = processes.slice(0, 10);
  }

  return result;
}

/**
 * Parse `dumpsys cpuinfo` output.
 *
 * Looks for:
 * - Per-process lines: `18% 1234/system_server: 12% user + 6% kernel`
 * - TOTAL line: `XX% TOTAL: YY% user + ZZ% kernel + WW% iowait + ...`
 */
export function parseCpuInfo(content: string): CpuInfoSummary {
  const result: CpuInfoSummary = {
    totalCpuPercent: 0,
    userPercent: 0,
    kernelPercent: 0,
    ioWaitPercent: 0,
    topProcesses: [],
  };

  if (!content) return result;

  // Parse TOTAL line
  // Format: "34% TOTAL: 18% user + 12% kernel + 2.1% iowait + 0.3% irq + 0.5% softirq"
  const totalMatch = content.match(/([\d.]+)%\s+TOTAL:\s*([\d.]+)%\s+user\s*\+\s*([\d.]+)%\s+kernel(?:\s*\+\s*([\d.]+)%\s+iowait)?/i);
  if (totalMatch) {
    result.totalCpuPercent = parseFloat(totalMatch[1]);
    result.userPercent = parseFloat(totalMatch[2]);
    result.kernelPercent = parseFloat(totalMatch[3]);
    result.ioWaitPercent = totalMatch[4] ? parseFloat(totalMatch[4]) : 0;
  }

  // Parse per-process lines
  // Format: "18% 1234/system_server: 12% user + 6% kernel"
  //     or: " 0.3% 567/logd: 0.1% user + 0.1% kernel"
  const processRegex = /^\s*([\d.]+)%\s+(\d+)\/([^:]+):\s*([\d.]+)%\s+user\s*\+\s*([\d.]+)%\s+kernel/gm;
  const processes: CpuInfoProcess[] = [];
  let match: RegExpExecArray | null;

  while ((match = processRegex.exec(content)) !== null) {
    processes.push({
      cpuPercent: parseFloat(match[1]),
      pid: parseInt(match[2], 10),
      processName: match[3].trim(),
    });
  }

  // Sort by CPU% descending, take top 10
  processes.sort((a, b) => b.cpuPercent - a.cpuPercent);
  result.topProcesses = processes.slice(0, 10);

  return result;
}

/**
 * Parse `lshal --all --types=all` output from the HARDWARE HALS section.
 *
 * Typical format (table with | separators):
 *   VINTF R | Interface | Transport | Arch | Thread Use | Server PID | Clients
 *   Y       | android.hardware.audio@6.0::IDevicesFactory/default | hwbinder | 64 | ... | 1234 | ...
 *
 * Or tab/space-separated:
 *   android.hardware.audio@6.0::IDevicesFactory/default hwbinder 64 1234
 *
 * Status is derived from the Server PID or explicit status columns.
 * Lines with "N/A" PID or "declared;..." are declared-only services.
 */
export function parseLshal(content: string, manufacturer?: string): HALStatusSummary {
  const result: HALStatusSummary = {
    totalServices: 0,
    aliveCount: 0,
    nonResponsiveCount: 0,
    declaredCount: 0,
    nonResponsiveServices: [],
    declaredServices: [],
    families: [],
    vendorIssueCount: 0,
    truncated: false,
  };

  if (!content) return result;

  // Detect truncated lshal output (system killed the process)
  if (/failed:\s*exit code/i.test(content) || /was the duration of/i.test(content)) {
    result.truncated = true;
  }

  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('VINTF') || trimmed.startsWith('Interface')) continue;

    // Try pipe-delimited format first (most common in bugreports)
    // Format: "Y | android.hardware.audio@6.0::IDevicesFactory/default | hwbinder | 64 | 1/1 | 1234 | 567 890"
    // Or:     "  | vendor.some.hal@1.0::IFoo/default | hwbinder |    | N/A | N/A |"
    if (trimmed.includes('|')) {
      const parts = trimmed.split('|').map((p) => p.trim());
      // Need at least: VINTF | Interface | Transport
      if (parts.length < 3) continue;

      // Interface is typically in column 1 (0-indexed), but could be 0 if no VINTF column
      let interfaceName = '';
      let transport = '';

      // Find the column that looks like an interface name (contains :: or @)
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes('::') || parts[i].includes('@')) {
          interfaceName = parts[i];
          // Transport is the next column
          if (i + 1 < parts.length) transport = parts[i + 1].toLowerCase();
          break;
        }
      }

      if (!interfaceName) continue;

      // Determine status from the rest of the line
      const status = inferHalStatus(trimmed);
      const isVendor = interfaceName.startsWith('vendor.');

      const service: HALService = {
        interfaceName,
        transport: transport || 'unknown',
        status,
        isVendor,
      };

      result.totalServices++;
      if (status === 'alive') {
        result.aliveCount++;
      } else if (status === 'non-responsive') {
        result.nonResponsiveCount++;
        result.nonResponsiveServices.push(service);
      } else if (status === 'declared') {
        result.declaredCount++;
        result.declaredServices.push(service);
      }
      continue;
    }

    // Try space/tab-delimited format
    // Format: "android.hardware.audio@6.0::IDevicesFactory/default hwbinder 64 1234"
    const spaceMatch = trimmed.match(/^(\S+@\S+::\S+)\s+(\w+)\s*(.*)/);
    if (spaceMatch) {
      const interfaceName = spaceMatch[1];
      const transport = spaceMatch[2].toLowerCase();
      const rest = spaceMatch[3];
      const status = inferHalStatus(rest || trimmed);
      const isVendor = interfaceName.startsWith('vendor.');

      const service: HALService = {
        interfaceName,
        transport,
        status,
        isVendor,
      };

      result.totalServices++;
      if (status === 'alive') {
        result.aliveCount++;
      } else if (status === 'non-responsive') {
        result.nonResponsiveCount++;
        result.nonResponsiveServices.push(service);
      } else if (status === 'declared') {
        result.declaredCount++;
        result.declaredServices.push(service);
      }
    }
  }

  // Group services into families
  const allServices = [
    ...result.nonResponsiveServices,
    ...result.declaredServices,
  ];
  // Collect alive services too (they're not stored separately, so rebuild from parsing)
  // We need all parsed services for grouping — collect them during parsing
  // Instead, re-derive from the content by grouping all recognized services
  groupHALFamilies(result, content, manufacturer);

  return result;
}

/** Known BSP vendor namespace prefixes — HALs from chipset vendors bundled in BSP */
const KNOWN_BSP_PREFIXES = [
  'qti', 'qualcomm', 'qcom',        // Qualcomm
  'display',                          // Qualcomm display subsystem (vendor.display.color, vendor.display.postproc)
  'mediatek', 'mtk',                 // MediaTek
  'sprd',                             // Spreadtrum/Unisoc
  'samsung',                          // Samsung
  'google',                           // Google
  'nxp',                              // NXP (NFC, secure element)
];

/**
 * Determine if a vendor HAL family is OEM-specific (vs BSP-bundled).
 * OEM detection: manufacturer name fuzzy-matches a vendor namespace segment.
 * Fallback: vendor HALs not matching any known BSP prefix are treated as OEM.
 */
function isOemFamily(familyKey: string, isVendor: boolean, manufacturer?: string): boolean {
  if (!isVendor) return false;

  // Extract the vendor namespace: "vendor.trimble.hardware.trmbkeypad::ITrmbKeypad" → "trimble.hardware.trmbkeypad"
  const afterVendor = familyKey.replace(/^vendor\./, '').split('::')[0];
  const segments = afterVendor.toLowerCase().split('.');

  // If manufacturer provided, check if any segment matches
  if (manufacturer) {
    const mfgLower = manufacturer.toLowerCase();
    if (segments.some((seg) => seg.includes(mfgLower) || mfgLower.includes(seg))) {
      return true;
    }
  }

  // Fallback: if no segment matches a known BSP prefix, treat as OEM
  const matchesBsp = segments.some((seg) =>
    KNOWN_BSP_PREFIXES.some((bsp) => seg.includes(bsp))
  );
  return !matchesBsp;
}

/**
 * Group HAL services into interface families.
 * Same interface at different versions (e.g. color@1.0, color@1.4) are grouped together.
 * Only the highest version's status matters for each family.
 */
function groupHALFamilies(result: HALStatusSummary, content: string, manufacturer?: string): void {
  // Collect all services with their parsed info
  const allServices: HALService[] = [];
  const lines = content.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('VINTF') || trimmed.startsWith('Interface')) continue;

    if (trimmed.includes('|')) {
      const parts = trimmed.split('|').map((p) => p.trim());
      if (parts.length < 3) continue;

      let interfaceName = '';
      let transport = '';
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes('::') || parts[i].includes('@')) {
          interfaceName = parts[i];
          if (i + 1 < parts.length) transport = parts[i + 1].toLowerCase();
          break;
        }
      }
      if (!interfaceName) continue;

      allServices.push({
        interfaceName,
        transport: transport || 'unknown',
        status: inferHalStatus(trimmed),
        isVendor: interfaceName.startsWith('vendor.'),
      });
      continue;
    }

    const spaceMatch = trimmed.match(/^(\S+@\S+::\S+)\s+(\w+)\s*(.*)/);
    if (spaceMatch) {
      allServices.push({
        interfaceName: spaceMatch[1],
        transport: spaceMatch[2].toLowerCase(),
        status: inferHalStatus(spaceMatch[3] || trimmed),
        isVendor: spaceMatch[1].startsWith('vendor.'),
      });
    }
  }

  // Group by family key: interfaceName without @version and without /instance
  const familyMap = new Map<string, { services: HALService[]; versions: Map<string, HALService> }>();

  for (const svc of allServices) {
    // Extract family key: everything before @version
    // e.g. "vendor.display.color@1.4::IDisplayColor/default" → "vendor.display.color::IDisplayColor"
    const beforeInstance = svc.interfaceName.split('/')[0]; // remove /default, /internal/0 etc
    const familyKey = beforeInstance.replace(/@[\d.]+/, '');

    // Extract version: between @ and ::
    const versionMatch = beforeInstance.match(/@([\d.]+)/);
    const version = versionMatch ? versionMatch[1] : '0';

    if (!familyMap.has(familyKey)) {
      familyMap.set(familyKey, { services: [], versions: new Map() });
    }
    const family = familyMap.get(familyKey)!;
    family.services.push(svc);

    // Keep highest-priority service per version (if multiple instances at same version)
    const existing = family.versions.get(version);
    if (!existing || statusPriority(svc.status) > statusPriority(existing.status)) {
      family.versions.set(version, svc);
    }
  }

  // Build HALFamily array
  const families: HALFamily[] = [];
  for (const [familyKey, { versions }] of familyMap) {
    // Find highest version
    const sortedVersions = [...versions.entries()].sort((a, b) => compareVersions(b[0], a[0]));
    const [highestVersion, highestSvc] = sortedVersions[0];

    // shortName: last segment before :: (without @version)
    const beforeColons = familyKey.split('::')[0];
    const segments = beforeColons.split('.');
    const shortName = segments[segments.length - 1] || beforeColons;

    families.push({
      familyName: familyKey,
      shortName,
      highestVersion,
      highestStatus: highestSvc.status,
      isVendor: highestSvc.isVendor,
      isOem: isOemFamily(familyKey, highestSvc.isVendor, manufacturer),
      versionCount: versions.size,
    });
  }

  result.families = families;
  result.vendorIssueCount = families.filter(
    (f) => f.isVendor && (f.highestStatus === 'non-responsive' || f.highestStatus === 'declared'),
  ).length;
}

/** Compare two version strings numerically (e.g. "1.4" > "1.10" → false, "2.0" > "1.4" → true) */
function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number);
  const pb = b.split('.').map(Number);
  const len = Math.max(pa.length, pb.length);
  for (let i = 0; i < len; i++) {
    const na = pa[i] ?? 0;
    const nb = pb[i] ?? 0;
    if (na !== nb) return na - nb;
  }
  return 0;
}

/**
 * Higher priority = more informative status (used when same version appears
 * from multiple lshal sources: binderized, passthrough, VINTF manifest).
 *
 * Priority: alive > non-responsive > declared
 * - alive: service is actually running (best)
 * - non-responsive: registered with hwservicemanager but not responding (real issue)
 * - declared: only listed in VINTF manifest, never started (least informative)
 */
function statusPriority(status: string): number {
  if (status === 'alive') return 2;
  if (status === 'non-responsive') return 1;
  if (status === 'declared') return 0;
  return 0;
}

/**
 * Infer HAL service status from a line of lshal output.
 * - If the line contains explicit status keywords, use those.
 * - "N/A" in PID column or "declared" → declared
 * - Numeric PID → alive
 * - Otherwise, check for non-responsive indicators.
 */
function inferHalStatus(line: string): string {
  const lower = line.toLowerCase();

  // Explicit status keywords
  if (/\bnon-responsive\b/.test(lower)) return 'non-responsive';
  if (/\bdeclared\b/.test(lower)) return 'declared';
  if (/\balive\b/.test(lower)) return 'alive';

  // N/A in PID column typically means declared/not-running
  // Check if PID field is N/A (common pattern: "| N/A |" or trailing "N/A")
  if (/\|\s*N\/A\s*\|/.test(line) || /\bN\/A\b/.test(line)) return 'declared';

  // If there's a numeric PID, it's alive
  if (/\|\s*\d+\s*\|/.test(line) || /\b\d{2,}\b/.test(line)) return 'alive';

  return 'alive';
}

/** Parse a KB value string like "5,832,568" to number 5832568 */
function parseKbValue(str: string): number {
  return parseInt(str.replace(/,/g, ''), 10) || 0;
}
