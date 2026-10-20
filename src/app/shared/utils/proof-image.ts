import { MAX_PROOF_BYTES, PROOF_IMAGE_TYPES } from '../../core/payments/manual-payments';

/** Longest side of an uploaded screenshot; phone screenshots stay readable at this size. */
const MAX_SIDE = 2000;
const QUALITY = 0.85;

/** Returns an error message when the file can't be used as a screenshot or QR image, otherwise `null`. */
export function imageFileError(file: File, maxBytes = MAX_PROOF_BYTES): string | null {
  if (!(PROOF_IMAGE_TYPES as readonly string[]).includes(file.type)) {
    return 'Please choose a JPG, PNG or WebP image.';
  }
  if (file.size > maxBytes)
    return `That image is larger than ${Math.round(maxBytes / 1024 / 1024)} MB.`;
  return null;
}

/**
 * Shrinks a transfer screenshot to at most 2000 px on its longest side as a JPEG, so uploads stay small on mobile
 * data. A file that is already small enough is returned as it is.
 */
export async function shrinkScreenshot(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That file could not be read as an image.');
  });
  try {
    const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height));
    if (scale === 1 && file.size <= 1024 * 1024) return file;
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser cannot process images.');
    // JPEG has no alpha channel; transparent PNGs would otherwise turn black.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', QUALITY),
    );
    if (!blob) throw new Error('Your browser cannot process images.');
    return blob;
  } finally {
    bitmap.close();
  }
}
