/**
 * A pasted image, ready to send to a vision model.
 *
 * Screenshots from a phone arrive at full device resolution — several megabytes
 * of base64 for something the model downsamples anyway. Large images are
 * redrawn at a sane size and re-encoded as JPEG before they ride along with a
 * turn, so a paste costs a few hundred kilobytes instead of a few megabytes.
 */
export const MAX_IMAGE_BYTES = 6 * 1024 * 1024;
const MAX_SIDE = 1280;
const INLINE_LIMIT = 1_200_000;

const readAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(new Error("That image could not be read."));
    reader.readAsDataURL(file);
  });

const shrink = (dataUrl) =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const scale = Math.min(1, MAX_SIDE / Math.max(img.width, img.height));
      if (scale === 1 && dataUrl.length < INLINE_LIMIT) {
        resolve(dataUrl);
        return;
      }
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        resolve(dataUrl);
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL("image/jpeg", 0.85));
    };
    img.onerror = () => reject(new Error("That image could not be read."));
    img.src = dataUrl;
  });

/** `{ name, dataUrl }`, or null when the file is not an image. */
export async function imageAttachment(file) {
  if (!file || !String(file.type || "").startsWith("image/")) return null;
  if (file.size > MAX_IMAGE_BYTES) throw new Error("That image is over the 6 MB limit.");

  const original = await readAsDataUrl(file);
  const name = file.name || "pasted image";
  try {
    return { name, dataUrl: await shrink(original) };
  } catch {
    return { name, dataUrl: original };
  }
}

/** The image files in a paste or drop event, in order. */
export function imageFilesFrom(event) {
  const dt = event?.clipboardData || event?.dataTransfer;
  if (!dt) return [];
  const files = [];
  if (dt.items) {
    for (const item of dt.items) {
      if (item.kind === "file" && String(item.type || "").startsWith("image/")) {
        const file = item.getAsFile();
        if (file) files.push(file);
      }
    }
  }
  if (!files.length && dt.files) {
    for (const file of dt.files) {
      if (String(file.type || "").startsWith("image/")) files.push(file);
    }
  }
  return files;
}
