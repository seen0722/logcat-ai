import { open, Entry, ZipFile } from 'yauzl-promise';
import { BugreportMetadata, BugreportSection, UnpackResult } from './types.js';

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

/**
 * Unpack a bugreport.zip and parse its contents into structured data.
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

      const buffer = await readEntry(zipFile, entry);
      rawFiles.set(fileName, buffer);

      // Identify main bugreport text file
      if (isMainBugreportFile(fileName)) {
        mainBugreportContent = buffer.toString('utf-8');
        mainBugreportName = fileName;
      }

      // Collect ANR trace files
      if (isAnrTraceFile(fileName)) {
        anrTraceFiles.push(fileName);
        anrTraceContents.set(fileName, buffer.toString('utf-8'));
      }

      // Collect tombstone files
      if (isTombstoneFile(fileName)) {
        tombstoneFiles.push(fileName);
        tombstoneContents.set(fileName, buffer.toString('utf-8'));
      }
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

/**
 * Parse the main bugreport text into sections delimited by
 * `------ SECTION_NAME (command) ------`
 */
export function parseSections(content: string): BugreportSection[] {
  const lines = content.split('\n');
  const sections: BugreportSection[] = [];
  let currentSection: { name: string; command: string; startLine: number; lines: string[] } | null = null;

  for (let i = 0; i < lines.length; i++) {
    const match = lines[i].match(SECTION_HEADER_RE);
    if (match) {
      // Close previous section
      if (currentSection) {
        sections.push({
          name: currentSection.name,
          command: currentSection.command,
          content: currentSection.lines.join('\n'),
          startLine: currentSection.startLine,
          endLine: i - 1,
        });
      }
      currentSection = {
        name: match[1],
        command: match[2],
        startLine: i,
        lines: [],
      };
    } else if (currentSection) {
      currentSection.lines.push(lines[i]);
    }
  }

  // Close last section
  if (currentSection) {
    sections.push({
      name: currentSection.name,
      command: currentSection.command,
      content: currentSection.lines.join('\n'),
      startLine: currentSection.startLine,
      endLine: lines.length - 1,
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
  const deviceModel = matchFirst(propsContent, DEVICE_MODEL_RE) ?? 'unknown';
  const manufacturer = matchFirst(propsContent, MANUFACTURER_RE) ?? 'unknown';
  const buildDate = matchFirst(propsContent, BUILD_DATE_RE) ?? 'unknown';

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
    deviceModel,
    manufacturer,
    buildDate,
    bugreportTimestamp,
    kernelVersion,
  };
}

/**
 * Extract logcat section contents (main, system, events, crash).
 */
function extractLogcatSections(sections: BugreportSection[]): string[] {
  const logcatKeywords = ['SYSTEM LOG', 'EVENT LOG', 'MAIN LOG', 'CRASH LOG', 'RADIO LOG', 'LOGCAT'];
  return sections
    .filter((s) => logcatKeywords.some((kw) => s.name.toUpperCase().includes(kw)) ||
      s.command.includes('logcat'))
    .map((s) => s.content);
}

function matchFirst(text: string, re: RegExp): string | null {
  const m = text.match(re);
  return m ? m[1] : null;
}
