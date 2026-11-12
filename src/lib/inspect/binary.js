import { fetchPublicBinary } from "@/lib/net-safe";

/**
 * Static triage of a binary artifact: container format, architecture, hashes,
 * embedded strings and the imported APIs that matter for behaviour and risk.
 * Nothing is disassembled and nothing is executed.
 */

const SCAN_LIMIT = 1200000;
const STRING_MIN = 6;

const ELF_MACHINES = { 0x03: "x86", 0x3e: "x86-64", 0x28: "ARM", 0xb7: "ARM64", 0xf3: "RISC-V", 0x08: "MIPS" };
const PE_MACHINES = { 0x014c: "x86", 0x8664: "x86-64", 0xaa64: "ARM64", 0x01c4: "ARMv7" };

const NOTABLE_APIS = [
  "CreateRemoteThread",
  "VirtualAllocEx",
  "WriteProcessMemory",
  "IsDebuggerPresent",
  "CheckRemoteDebuggerPresent",
  "LoadLibrary",
  "GetProcAddress",
  "ptrace",
  "dlopen",
  "dlsym",
  "execve",
  "system",
  "popen",
  "fork",
  "socket",
  "connect",
  "SSL_read",
  "AES_encrypt",
  "curl_easy_init",
];

const at16 = (bytes, offset, little) =>
  little ? bytes[offset] | (bytes[offset + 1] << 8) : (bytes[offset] << 8) | bytes[offset + 1];

const at32 = (bytes, offset, little) =>
  little
    ? bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)
    : (bytes[offset] << 24) | (bytes[offset + 1] << 16) | (bytes[offset + 2] << 8) | bytes[offset + 3];

const has = (bytes, text, offset = 0) => {
  for (let index = 0; index < text.length; index += 1) {
    if (bytes[offset + index] !== text.charCodeAt(index)) return false;
  }
  return true;
};

const hex = (machine) => `0x${(machine >>> 0).toString(16)}`;

function detectFormat(bytes) {
  if (bytes[0] === 0x7f && has(bytes, "ELF", 1)) {
    const little = bytes[5] === 1;
    const machine = at16(bytes, 18, little);
    return {
      format: "ELF executable",
      platform: "Linux / Unix",
      arch: ELF_MACHINES[machine] || hex(machine),
      bits: bytes[4] === 2 ? 64 : 32,
      kind: { 1: "relocatable", 2: "executable", 3: "shared object / PIE", 4: "core dump" }[at16(bytes, 16, little)] || "unknown",
    };
  }

  if (bytes[0] === 0x4d && bytes[1] === 0x5a) {
    const peAt = at32(bytes, 0x3c, true);
    if (peAt > 0 && peAt < bytes.length - 64 && has(bytes, "PE\0\0", peAt)) {
      const machine = at16(bytes, peAt + 4, true);
      const characteristics = at16(bytes, peAt + 22, true);
      return {
        format: "PE image",
        platform: "Windows",
        arch: PE_MACHINES[machine] || hex(machine),
        bits: at16(bytes, peAt + 24, true) === 0x20b ? 64 : 32,
        kind: characteristics & 0x2000 ? "DLL" : "executable",
      };
    }
    return { format: "DOS / MZ image", platform: "Windows", arch: "unknown", bits: 0, kind: "unknown" };
  }

  const magic = at32(bytes, 0, false);
  if (magic === 0xfeedface || magic === 0xfeedfacf) {
    return {
      format: "Mach-O binary",
      platform: "macOS / iOS",
      arch: "see load commands",
      bits: magic === 0xfeedfacf ? 64 : 32,
      kind: "executable or library",
    };
  }
  if (magic === 0xcafebabe) {
    return { format: "Fat Mach-O or Java class", platform: "macOS / Java", arch: "multi", bits: 0, kind: "container" };
  }
  if (bytes[0] === 0x00 && has(bytes, "asm", 1)) {
    return { format: "WebAssembly module", platform: "any", arch: "wasm", bits: 32, kind: "module" };
  }
  if (bytes[0] === 0x50 && bytes[1] === 0x4b) {
    return {
      format: "ZIP container",
      platform: "any",
      arch: "n/a",
      bits: 0,
      kind: "archive (also .asar, .jar, .apk, .docx, .epub)",
    };
  }
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) return { format: "gzip stream", platform: "any", arch: "n/a", bits: 0, kind: "compressed" };
  if (bytes[0] === 0x42 && bytes[1] === 0x5a && bytes[2] === 0x68) return { format: "bzip2 stream", platform: "any", arch: "n/a", bits: 0, kind: "compressed" };
  if (bytes[0] === 0x28 && bytes[1] === 0xb5 && bytes[2] === 0x2f && bytes[3] === 0xfd) return { format: "zstd stream", platform: "any", arch: "n/a", bits: 0, kind: "compressed" };
  if (bytes[0] === 0xfd && has(bytes, "7zX", 1)) return { format: "xz stream", platform: "any", arch: "n/a", bits: 0, kind: "compressed" };
  if (bytes[0] === 0x89 && has(bytes, "PNG", 1)) return { format: "PNG image", platform: "any", arch: "n/a", bits: 0, kind: "image" };
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return { format: "JPEG image", platform: "any", arch: "n/a", bits: 0, kind: "image" };
  if (has(bytes, "%PDF")) return { format: "PDF document", platform: "any", arch: "n/a", bits: 0, kind: "document" };
  if (has(bytes, "SQLite format 3")) return { format: "SQLite database", platform: "any", arch: "n/a", bits: 0, kind: "database" };
  if (has(bytes, "dex\n")) return { format: "Android DEX", platform: "Android", arch: "dalvik", bits: 0, kind: "bytecode" };

  return { format: "unrecognised / raw", platform: "unknown", arch: "unknown", bits: 0, kind: "unknown" };
}

const isPrintable = (code) => code === 9 || (code >= 32 && code <= 126);

function extractStrings(bytes) {
  const limit = Math.min(bytes.length, SCAN_LIMIT);
  const out = [];
  let current = "";
  for (let index = 0; index < limit; index += 1) {
    const code = bytes[index];
    if (isPrintable(code)) {
      current += String.fromCharCode(code);
      continue;
    }
    if (current.length >= STRING_MIN) out.push(current);
    current = "";
  }
  if (current.length >= STRING_MIN) out.push(current);
  return out;
}

function shannon(bytes) {
  const counts = new Uint32Array(256);
  const limit = Math.min(bytes.length, 262144);
  for (let index = 0; index < limit; index += 1) counts[bytes[index]] += 1;
  let value = 0;
  for (let index = 0; index < 256; index += 1) {
    if (!counts[index]) continue;
    const p = counts[index] / limit;
    value -= p * Math.log2(p);
  }
  return Number(value.toFixed(2));
}

async function digest(bytes) {
  const buffer = await crypto.subtle.digest("SHA-256", bytes);
  return [...new Uint8Array(buffer)].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function analyzeBinary(raw) {
  const file = await fetchPublicBinary(raw);
  if (file.error) return { mode: "binary", target: raw, error: file.error };

  const bytes = file.bytes || new Uint8Array();
  if (!bytes.length) return { mode: "binary", target: file.url, error: "That address returned an empty body." };

  const strings = extractStrings(bytes);
  const joined = strings.join("\n");
  const entropy = shannon(bytes);

  const urls = [...new Set(strings.flatMap((s) => (s.match(/(?:https?|wss?):\/\/[^\s"'<>]+/g) || []).map((u) => u.slice(0, 200))))].slice(0, 18);
  const paths = [...new Set(strings.filter((s) => /^(?:\/|[A-Za-z]:\\|\/[A-Za-z0-9_.-]+\/)/.test(s)).map((s) => s.slice(0, 160)))].slice(0, 12);
  const libraries = [...new Set(strings.flatMap((s) => s.match(/[A-Za-z0-9_.+-]+\.(?:so(?:\.\d+)*|dylib|dll|node|py|exe|bin)\b/gi) || []))].slice(0, 14);
  const emails = [...new Set(strings.flatMap((s) => s.match(/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g) || []))].slice(0, 6);
  const apis = NOTABLE_APIS.filter((api) => joined.includes(api));

  return {
    mode: "binary",
    target: file.url,
    status: file.status,
    size: file.size,
    analysed: bytes.length,
    sha256: await digest(bytes),
    format: detectFormat(bytes),
    entropy,
    packingHint: entropy > 7.4 ? "high entropy: the payload is likely compressed, packed or encrypted" : "entropy is in the normal range for ordinary code",
    contentType: file.contentType,
    strings: {
      total: strings.length,
      urls,
      paths,
      libraries,
      emails,
      notableApis: apis,
    },
    limitations: [
      "Headers and embedded strings only: no disassembly or decompilation, so logic is not reconstructed.",
      "Nothing is executed and no behaviour is observed at runtime.",
      `Only the first ${bytes.length} bytes were read; strings past that point are not reported.`,
    ],
  };
}