import { open, Entry, ZipFile } from 'yauzl-promise';
import { BugreportMetadata, BugreportSection, LogcatBuffer, LogcatSection, UnpackResult } from './types.js';

// Section header pattern: ------ SECTION_NAME (command) ------
const SECTION_HEADER_RE = /^------\s+(.+?)\s+\((.+?)\)\s+------$/;

// Metadata patterns
const ANDROID_VERSION_RE = /\[ro\.build\.version\.release\]:\s*\[(.+?)\]/;
const SDK_LEVEL_RE = /\[ro\.build\.version\.sdk\]:\s*\[(\d+)\]/;
const BUILD_FINGERPRINT_RE = /\[ro\.build\.fingerprint\]:\s*\[(.+?)\]/;
const DEVICE_MODEL_RE = /\[ro\.product\.model\]:\s*\[(.+?)\]/;
const MANUFACTURER_RE = /\[ro\.product\.manufacturer\]:\s*\[(.+?)\]/;
const BUILD_DATE_RE = /\[ro\.build\.date\]:\s*\[(.+?)\]/;
const KERNEL_VERSION_RE = /Linux version\s+(\S+)/;
const BUILD_TYPE_RE = /\[ro\.build\.type\]:\s*\[(.+?)\]/;
const PLATFORM_RE = /\[ro\.board\.platform\]:\s*\[(.+?)\]/;
const HARDWARE_RE = /\[ro\.hardware\]:\s*\[(.+?)\]/;
const CPU_ABI_RE = /\[ro\.product\.cpu\.abi\]:\s*\[(.+?)\]/;
const SERIAL_RE = /\[ro\.boot\.serialno\]:\s*\[(.+?)\]/;
const BASEBAND_RE = /\[gsm\.version\.baseband\]:\s*\[(.+?)\]/;
const BOOTLOADER_RE = /\[ro\.bootimage\.build\.fingerprint\]:\s*\[(.+?)\]/;
const SECURITY_PATCH_RE = /\[ro\.build\.version\.security_patch\]:\s*\[(.+?)\]/;

/**
 * Unpack a bugreport.zip and parse its contents into structured data.
 * Performance: Only reads files needed for analysis (bugreport, ANR, tombstones).
 */
export async function unpackBugreport(zipPath: string): Promise<UnpackResult> {
  const zipFile = await open(zipPath);
  const rawFiles = new Map<string, Buffer>();
  const anrTraceContents = new Map<string, string>();
  const tombstoneContents = new Map<string, string>();
  const anrTraceFiles: string[] = [];
  const tombstoneFiles: string[] = [];

  let mainBugreportContent = '';
  let mainBugreportName = '';

  try {
    for await (const entry of zipFile) {
      const fileName = entry.filename;

      // Skip directories
      if (fileName.endsWith('/')) continue;

      // Only read files we actually need for analysis — skip screenshots, misc logs, etc.
      if (isMainBugreportFile(fileName)) {
        const buffer = await readEntry(zipFile, entry);
        rawFiles.set(fileName, buffer);
        mainBugreportContent = buffer.toString('utf-8');
        mainBugreportName = fileName;
      } else if (isAnrTraceFile(fileName)) {
        const buffer = await readEntry(zipFile, entry);
        rawFiles.set(fileName, buffer);
        anrTraceFiles.push(fileName);
        anrTraceContents.set(fileName, buffer.toString('utf-8'));
      } else if (isTombstoneFile(fileName)) {
        const buffer = await readEntry(zipFile, entry);
        rawFiles.set(fileName, buffer);
        tombstoneFiles.push(fileName);
        tombstoneContents.set(fileName, buffer.toString('utf-8'));
      }
      // All other files are skipped — not read into memory
    }
  } finally {
    await zipFile.close();
  }

  if (!mainBugreportContent) {
    throw new Error(
      `No main bugreport text file found in zip. Files: ${[...rawFiles.keys()].join(', ')}`
    );
  }

  const sections = parseSections(mainBugreportContent);
  const metadata = extractMetadata(mainBugreportContent, sections);
  const logcatSections = extractLogcatSections(sections);

  // Release the main bugreport string — sections already hold their own content
  mainBugreportContent = '';

  return {
    metadata,
    sections,
    logcatSections,
    anrTraceFiles,
    tombstoneFiles,
    anrTraceContents,
    tombstoneContents,
    rawFiles,
  };
}

/**
 * Read a zip entry into a Buffer.
 */
async function readEntry(zipFile: ZipFile, entry: Entry): Promise<Buffer> {
  const stream = await entry.openReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}

/**
 * Check if a filename is the main bugreport text file.
 * Matches: bugreport-DEVICE-DATE.txt or bugreport.txt at any nesting level.
 */
function isMainBugreportFile(fileName: string): boolean {
  const base = fileName.split('/').pop() ?? '';
  return /^bugreport.*\.txt$/.test(base) && !base.includes('mini');
}

function isAnrTraceFile(fileName: string): boolean {
  return /(?:FS\/)?data\/anr\//i.test(fileName) || /anr_\d+/.test(fileName);
}

function isTombstoneFile(fileName: string): boolean {
  return /(?:FS\/)?data\/tombstones\//i.test(fileName);
}

// Global+multiline regex for finding section headers without splitting content into lines
const SECTION_HEADER_GM = /^------\s+(.+?)\s+\((.+?)\)\s+------$/gm;

/**
 * Parse the main bugreport text into sections delimited by
 * `------ SECTION_NAME (command) ------`
 *
 * Performance: Uses regex exec + slice instead of split('\n') + join('\n').
 * For a 300MB file, this avoids creating ~3 million intermediate string objects,
 * dramatically reducing GC pressure and memory usage.
 */
export function parseSections(content: string): BugreportSection[] {
  const sections: BugreportSection[] = [];

  // Find all section header positions using global multiline regex
  const headers: Array<{ name: string; command: string; start: number; end: number }> = [];
  SECTION_HEADER_GM.lastIndex = 0; // reset state
  let m: RegExpExecArray | null;
  while ((m = SECTION_HEADER_GM.exec(content)) !== null) {
    headers.push({
      name: m[1],
      command: m[2],
      start: m.index,
      end: m.index + m[0].length,
    });
  }

  if (headers.length === 0) return [];

  // Compute line numbers with a single incremental pass through content.
  // Count newlines up to each header position to derive 0-based line numbers.
  let lineNum = 0;
  let scanPos = 0;
  const headerLineNums: number[] = [];

  for (const h of headers) {
    for (let i = scanPos; i < h.start; i++) {
      if (content.charCodeAt(i) === 10) lineNum++;
    }
    headerLineNums.push(lineNum);
    scanPos = h.start;
  }
  // Count remaining newlines for the last section's endLine
  for (let i = scanPos; i < content.length; i++) {
    if (content.charCodeAt(i) === 10) lineNum++;
  }
  const totalLineCount = lineNum;

  // Build sections using slice() — avoids creating millions of intermediate strings
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i];
    const contentStart = Math.min(h.end + 1, content.length); // skip \n after header
    const contentEnd = i + 1 < headers.length ? headers[i + 1].start : content.length;
    const endLine = i + 1 < headers.length ? headerLineNums[i + 1] - 1 : totalLineCount;

    // Extract section content; strip one trailing \n (the newline before the next header)
    let sectionContent = content.slice(contentStart, contentEnd);
    if (sectionContent.endsWith('\n')) {
      sectionContent = sectionContent.slice(0, -1);
    }

    sections.push({
      name: h.name,
      command: h.command,
      content: sectionContent,
      startLine: headerLineNums[i],
      endLine,
    });
  }

  return sections;
}

/**
 * Extract device/build metadata from bugreport content and sections.
 */
function extractMetadata(content: string, sections: BugreportSection[]): BugreportMetadata {
  // Try to find SYSTEM PROPERTIES section first for most metadata
  const propsSection = sections.find(
    (s) => s.name === 'SYSTEM PROPERTIES' || s.command.includes('getprop')
  );
  const propsContent = propsSection?.content ?? content;

  const androidVersion = matchFirst(propsContent, ANDROID_VERSION_RE) ?? 'unknown';
  const sdkLevel = parseInt(matchFirst(propsContent, SDK_LEVEL_RE) ?? '0', 10);
  const buildFingerprint = matchFirst(propsContent, BUILD_FINGERPRINT_RE) ?? 'unknown';
  const buildType = matchFirst(propsContent, BUILD_TYPE_RE) ?? 'unknown';
  const deviceModel = matchFirst(propsContent, DEVICE_MODEL_RE) ?? 'unknown';
  const manufacturer = matchFirst(propsContent, MANUFACTURER_RE) ?? 'unknown';
  const buildDate = matchFirst(propsContent, BUILD_DATE_RE) ?? 'unknown';

  // Hardware & software properties
  const platform = matchFirst(propsContent, PLATFORM_RE) ?? undefined;
  const hardware = matchFirst(propsContent, HARDWARE_RE) ?? undefined;
  const cpuAbi = matchFirst(propsContent, CPU_ABI_RE) ?? undefined;
  const serialNumber = matchFirst(propsContent, SERIAL_RE) ?? undefined;
  const basebandVersion = matchFirst(propsContent, BASEBAND_RE) ?? undefined;
  const bootloaderVersion = matchFirst(propsContent, BOOTLOADER_RE) ?? undefined;
  const securityPatchLevel = matchFirst(propsContent, SECURITY_PATCH_RE) ?? undefined;

  // Kernel version from KERNEL LOG or dmesg section
  const kernelSection = sections.find(
    (s) => s.name === 'KERNEL LOG' || s.command.includes('dmesg')
  );
  const kernelVersion = matchFirst(kernelSection?.content ?? content, KERNEL_VERSION_RE) ?? 'unknown';

  // Bugreport timestamp from first line or filename
  const timestampMatch = content.match(/^==\s+dumpstate:\s+(\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2})/m);
  const bugreportTimestamp = timestampMatch
    ? new Date(timestampMatch[1])
    : new Date();

  return {
    androidVersion,
    sdkLevel,
    buildFingerprint,
    buildType,
    deviceModel,
    manufacturer,
    buildDate,
    bugreportTimestamp,
    kernelVersion,
    platform,
    hardware,
    cpuAbi,
    serialNumber,
    basebandVersion,
    bootloaderVersion,
    securityPatchLevel,
  };
}

/**
 * Extract logcat section contents with buffer type info (main, system, events, crash, radio).
 */
function extractLogcatSections(sections: BugreportSection[]): LogcatSection[] {
  const logcatKeywords = ['SYSTEM LOG', 'EVENT LOG', 'MAIN LOG', 'CRASH LOG', 'RADIO LOG', 'LOGCAT'];

  const bufferMap: Array<[string, LogcatBuffer]> = [
    ['MAIN LOG', 'main'],
    ['SYSTEM LOG', 'system'],
    ['EVENT LOG', 'events'],
    ['CRASH LOG', 'crash'],
    ['RADIO LOG', 'radio'],
  ];

  return sections
    .filter((s) => logcatKeywords.some((kw) => s.name.toUpperCase().includes(kw)) ||
      s.command.includes('logcat'))
    .map((s) => {
      const nameUpper = s.name.toUpperCase();
      const matched = bufferMap.find(([kw]) => nameUpper.includes(kw));
      return {
        buffer: matched ? matched[1] : 'main',
        content: s.content,
      };
    });
}

function matchFirst(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1] : null;
}
