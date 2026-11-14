/** Minimal STORE-method zip writer — no dependencies, enough for project export. */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[i] = c >>> 0;
  }
  return table;
})();

const crc32 = (bytes) => {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const u16 = (n) => [n & 0xff, (n >>> 8) & 0xff];
const u32 = (n) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff];

const DATA_URL = /^data:[^;,]*;base64,/i;

/** Generated media is stored as a data URL — a zip needs its real bytes. */
const bytesOf = (content, encoder) => {
  if (!DATA_URL.test(content)) return encoder.encode(content);
  const binary = atob(content.slice(content.indexOf(",") + 1));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
};

/** files: [{ path, content }] → Blob (application/zip) */
export function makeZip(files) {
  const encoder = new TextEncoder();
  const chunks = [];
  const central = [];
  let offset = 0;

  files.forEach((file) => {
    const nameBytes = encoder.encode(file.path.replace(/^\//, ""));
    const data = bytesOf(file.content ?? "", encoder);
    const crc = crc32(data);

    const local = [
      ...u32(0x04034b50),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0),
    ];
    chunks.push(new Uint8Array(local), nameBytes, data);

    central.push([
      ...u32(0x02014b50),
      ...u16(20),
      ...u16(20),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(crc),
      ...u32(data.length),
      ...u32(data.length),
      ...u16(nameBytes.length),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u16(0),
      ...u32(0),
      ...u32(offset),
    ]);
    offset += local.length + nameBytes.length + data.length;
  });

  const centralStart = offset;
  central.forEach((header, i) => {
    const nameBytes = encoder.encode(files[i].path.replace(/^\//, ""));
    const record = new Uint8Array([...header, ...nameBytes]);
    chunks.push(record);
    offset += record.length;
  });

  chunks.push(
    new Uint8Array([
      ...u32(0x06054b50),
      ...u16(0),
      ...u16(0),
      ...u16(files.length),
      ...u16(files.length),
      ...u32(offset - centralStart),
      ...u32(centralStart),
      ...u16(0),
    ]),
  );

  return new Blob(chunks, { type: "application/zip" });
}

export function downloadZip(files, name = "project") {
  const url = URL.createObjectURL(makeZip(files));
  const a = document.createElement("a");
  a.href = url;
  a.download = `${name || "project"}.zip`;
  a.click();
  URL.revokeObjectURL(url);
}