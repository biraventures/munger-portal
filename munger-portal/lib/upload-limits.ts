/**
 * Upload size limits (must match nnm-property-tax-api/src/utils/uploadLimits.ts): a photo at most 750 KB, a PDF at most
 * 2 MB. Photos are shrunk here automatically, so staff and citizens never have to compress them by hand.
 */
export const MAX_PHOTO_BYTES = 750 * 1024;
export const MAX_PDF_BYTES = 2 * 1024 * 1024;

export const PHOTO_LIMIT_TEXT = "photos are reduced to 750 KB automatically";
export const PDF_LIMIT_TEXT = "PDF up to 2 MB";

export function isPdfFile(file: Blob & { name?: string }): boolean {
  return file.type === "application/pdf" || /\.pdf$/i.test(file.name ?? "");
}

export function isPhotoFile(file: Blob & { name?: string }): boolean {
  return file.type.startsWith("image/") || /\.(jpe?g|png|webp|heic)$/i.test(file.name ?? "");
}

export function formatBytes(bytes: number): string {
  return bytes >= 1024 * 1024 ? `${(bytes / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(bytes / 1024)} KB`;
}

/** Throws a readable error when a PDF is over 2 MB. */
export function assertPdfSize(file: Blob & { name?: string }): void {
  if (file.size > MAX_PDF_BYTES) {
    throw new Error(`${file.name ? `${file.name} is` : "The PDF is"} ${formatBytes(file.size)} - a PDF can be at most 2 MB. Scan it at a lower resolution or in black and white.`);
  }
}

async function loadImage(file: Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = () => reject(new Error("This photo could not be read. Please choose a JPG or PNG photo."));
      img.src = url;
    });
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Shrinks a photo to a JPEG of at most `maxBytes` (default 750 KB), stepping the size and quality down until it fits.
 * A JPG / PNG already within the limit is returned untouched.
 */
export async function shrinkPhoto(file: Blob & { name?: string }, maxBytes = MAX_PHOTO_BYTES): Promise<Blob> {
  if (file.size <= maxBytes && (file.type === "image/jpeg" || file.type === "image/png")) return file;
  const img = await loadImage(file);
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("This browser cannot prepare the photo for upload.");
  let last: Blob | null = null;
  for (const side of [1600, 1280, 1024, 800, 640]) {
    const scale = Math.min(1, side / Math.max(img.naturalWidth, img.naturalHeight));
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale));
    ctx.fillStyle = "#fff"; // transparent PNG areas become white, not black
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    for (const q of [0.82, 0.72, 0.62, 0.52]) {
      last = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", q));
      if (last && last.size <= maxBytes) return last;
    }
  }
  if (!last) throw new Error("This photo could not be prepared for upload.");
  throw new Error(`The photo could not be reduced below ${formatBytes(maxBytes)}. Please choose a smaller photo.`);
}

/** The file ready to send: a photo shrunk to 750 KB, a PDF checked against 2 MB, anything else unchanged. */
export async function prepareUpload(file: File): Promise<{ blob: Blob; name: string; type: string }> {
  if (isPdfFile(file)) {
    assertPdfSize(file);
    return { blob: file, name: file.name, type: "application/pdf" };
  }
  if (isPhotoFile(file)) {
    const blob = await shrinkPhoto(file);
    const name = blob === file ? file.name : file.name.replace(/\.[^.]+$/, "") + ".jpg";
    return { blob, name, type: blob.type || "image/jpeg" };
  }
  return { blob: file, name: file.name, type: file.type };
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(blob);
  });
}

export function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error("Could not read the file."));
    r.readAsDataURL(blob);
  });
}

/**
 * The photo as a File of at most 750 KB, ready to keep in form state (a JPEG when it had to be shrunk). If the browser
 * cannot shrink it, the original comes back and the server's check gives the message.
 */
export async function shrinkPhotoFile(file: File): Promise<File> {
  try {
    const blob = await shrinkPhoto(file);
    if (blob === file) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", { type: "image/jpeg" });
  } catch {
    return file;
  }
}
