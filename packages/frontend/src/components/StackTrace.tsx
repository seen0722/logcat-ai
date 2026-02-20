/**
 * StackTrace — renders native and Java stack frames with syntax highlighting.
 * Handles standard Java dump, native backtrace, and OAT-compiled formats.
 */

interface Props {
  /** Raw stack trace text (newline-separated) or array of frame strings */
  frames: string[] | string;
  maxHeight?: string;
}

interface ParsedFrame {
  raw: string;
  type: 'native' | 'java' | 'oat-java' | 'other';
  frameNum?: string;
  library?: string;
  libShort?: string;
  funcName?: string;     // simplified function name (no params)
  funcFull?: string;     // full function signature
  className?: string;
  methodName?: string;
  fileName?: string;
  lineNum?: string;
}

// native: #00 pc 0x... /path/to/lib.so (function+offset) (BuildId: ...)
// Also:   #00 pc 0x... /path/to/lib.so (function+offset) (BuildId: ...)
const NATIVE_RE =
  /^(?:native:\s+)?#(\d+)\s+pc\s+[\da-f]+\s+(\S+\.so)\s*(?:\((.+?)\))?\s*(?:\(BuildId:.*\))?$/;

// #NN pc addr /path/to/file.oat (com.example.Class.method+offset)
// #NN pc addr /path/to/file.jar (com.example.Class.method+offset)
const OAT_JAR_RE =
  /^(?:native:\s+)?#(\d+)\s+pc\s+[\da-f]+\s+(\S+\.(?:oat|jar))\s+\((\S+?)([+-]\d+)?\)$/;

// at com.example.Class.method(File.java:42)
const JAVA_RE =
  /^at\s+([\w$.<>]+)\.([\w$<>]+)\((.+?)(?::(\d+))?\)$/;

/**
 * Simplify a C++ function signature:
 *   "android::hardware::IPCThreadState::transact(int, unsigned int, ...)" → "IPCThreadState::transact"
 *   "android::hardware::gnss::V1_0::BpHwGnss::_hidl_stop(...)" → "BpHwGnss::_hidl_stop"
 */
function simplifyNativeFunc(full: string): string {
  // Strip everything after '(' (parameters)
  const parenIdx = full.indexOf('(');
  const nameOnly = parenIdx >= 0 ? full.slice(0, parenIdx) : full;
  // Strip offset like "+244"
  const plusIdx = nameOnly.lastIndexOf('+');
  const clean = plusIdx >= 0 ? nameOnly.slice(0, plusIdx) : nameOnly;
  // Take last two segments of :: chain (Class::method)
  const parts = clean.split('::');
  if (parts.length >= 2) {
    return parts.slice(-2).join('::');
  }
  return clean;
}

function parseFrame(raw: string): ParsedFrame {
  const trimmed = raw.trim();

  // Try OAT/JAR frame first (more specific than generic native)
  const oatMatch = trimmed.match(OAT_JAR_RE);
  if (oatMatch) {
    const lib = oatMatch[2];
    const libShort = lib.split('/').pop() ?? lib;
    const fullName = oatMatch[3]; // e.g. "com.android.server.location.gnss.hal.GnssNative$GnssHal.stop"
    const lastDot = fullName.lastIndexOf('.');
    const className = lastDot >= 0 ? fullName.slice(0, lastDot) : fullName;
    const methodName = lastDot >= 0 ? fullName.slice(lastDot + 1) : '';
    return {
      raw: trimmed,
      type: 'oat-java',
      frameNum: oatMatch[1],
      library: lib,
      libShort,
      className,
      methodName,
    };
  }

  // Try native .so frame
  const nativeMatch = trimmed.match(NATIVE_RE);
  if (nativeMatch) {
    const lib = nativeMatch[2];
    const libShort = lib.split('/').pop() ?? lib;
    const funcFull = nativeMatch[3] ?? '';
    const funcName = funcFull ? simplifyNativeFunc(funcFull) : '';
    return {
      raw: trimmed,
      type: 'native',
      frameNum: nativeMatch[1],
      library: lib,
      libShort,
      funcName,
      funcFull,
    };
  }

  // Try Java frame
  const javaMatch = trimmed.match(JAVA_RE);
  if (javaMatch) {
    return {
      raw: trimmed,
      type: 'java',
      className: javaMatch[1],
      methodName: javaMatch[2],
      fileName: javaMatch[3],
      lineNum: javaMatch[4],
    };
  }

  return { raw: trimmed, type: 'other' };
}

function isHalOrBinder(frame: ParsedFrame): boolean {
  const text = frame.funcFull ?? frame.className ?? frame.raw;
  return (
    text.includes('IPCThreadState') ||
    text.includes('BpHwBinder') ||
    text.includes('_hidl_') ||
    text.includes('BinderProxy') ||
    text.includes('HwBinder') ||
    /android\.hardware\./.test(frame.raw) ||
    /vendor\..*\.hardware/.test(frame.raw)
  );
}

function isFramework(frame: ParsedFrame): boolean {
  const cls = frame.className ?? '';
  const lib = frame.libShort ?? '';
  return (
    cls.startsWith('android.os.') ||
    cls.startsWith('android.app.') ||
    cls.startsWith('com.android.internal.os.') ||
    cls.startsWith('java.lang.reflect.') ||
    cls.startsWith('dalvik.') ||
    cls.startsWith('libcore.') ||
    lib === 'libart.so' ||
    frame.funcName === 'nterp_helper' ||
    frame.funcName === 'art_jni_trampoline' ||
    frame.funcName === 'art_quick_invoke_stub' ||
    frame.funcName === 'art_quick_invoke_static_stub'
  );
}

/** Split class name into package prefix and class name for styling */
function splitClass(cls: string): { prefix: string; name: string } {
  const parts = cls.split('.');
  if (parts.length <= 1) return { prefix: '', name: cls };
  const name = parts.pop()!;
  const prefix = parts.join('.') + '.';
  return { prefix, name };
}

function FrameRow({ frame }: { frame: ParsedFrame }) {
  const hal = isHalOrBinder(frame);
  const fw = !hal && isFramework(frame);

  const rowClass = [
    'flex items-baseline gap-1.5 py-px',
    fw ? 'opacity-30' : '',
    hal ? 'bg-amber-500/10 -mx-2 px-2 rounded' : '',
  ].join(' ');

  if (frame.type === 'native') {
    return (
      <div className={rowClass} title={frame.funcFull ? `${frame.library} (${frame.funcFull})` : frame.library}>
        <span className="text-gray-600 select-none w-8 shrink-0 text-right">#{frame.frameNum}</span>
        <span className="text-blue-400/60 shrink-0">{frame.libShort}</span>
        {frame.funcName && (
          <span className={`truncate ${hal ? 'text-amber-300 font-medium' : 'text-gray-300'}`}>
            {frame.funcName}
          </span>
        )}
      </div>
    );
  }

  if (frame.type === 'oat-java') {
    const { prefix, name } = splitClass(frame.className ?? '');
    const fullPath = frame.methodName
      ? `${frame.className}.${frame.methodName}`
      : frame.className ?? '';
    return (
      <div className={rowClass} title={fullPath}>
        <span className="text-gray-600 select-none w-8 shrink-0 text-right">#{frame.frameNum}</span>
        <span className="shrink-0">
          <span className="text-gray-600">{prefix}</span>
          <span className={hal ? 'text-amber-300' : 'text-purple-400'}>{name}</span>
        </span>
        {frame.methodName && (
          <>
            <span className="text-gray-500">.</span>
            <span className="text-yellow-300">{frame.methodName}</span>
          </>
        )}
        <span className="text-gray-600 ml-1">({frame.libShort})</span>
      </div>
    );
  }

  if (frame.type === 'java') {
    const isNativeMethod = frame.fileName === 'Native method';
    const { prefix, name } = splitClass(frame.className ?? '');
    const fullPath = `${frame.className}.${frame.methodName}`;
    return (
      <div className={rowClass} title={fullPath}>
        <span className="text-gray-600 select-none w-8 shrink-0 text-right" />
        <span className="text-gray-600 shrink-0">at</span>
        <span className="shrink-0">
          <span className="text-gray-600">{prefix}</span>
          <span className={hal ? 'text-amber-300' : 'text-purple-400'}>{name}</span>
        </span>
        <span className="text-gray-500">.</span>
        <span className="text-yellow-300 shrink-0">{frame.methodName}</span>
        {isNativeMethod ? (
          <span className="text-gray-600 italic">(Native)</span>
        ) : (
          <span className="text-gray-600 truncate">
            ({frame.fileName}{frame.lineNum ? `:${frame.lineNum}` : ''})
          </span>
        )}
      </div>
    );
  }

  // Other / unrecognized
  if (!frame.raw) return null;
  return (
    <div className="text-gray-600 pl-10 truncate">{frame.raw}</div>
  );
}

export default function StackTrace({ frames, maxHeight = '20rem' }: Props) {
  const lines = Array.isArray(frames) ? frames : frames.split('\n');
  const parsed = lines
    .map((line) => parseFrame(line))
    .filter((f) => f.raw.length > 0);

  if (parsed.length === 0) return null;

  return (
    <div
      className="p-3 bg-surface rounded text-xs font-mono overflow-x-auto overflow-y-auto leading-5"
      style={{ maxHeight }}
    >
      {parsed.map((frame, i) => (
        <FrameRow key={i} frame={frame} />
      ))}
    </div>
  );
}
