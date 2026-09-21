/** Largest source picture accepted before resizing. */
export const AVATAR_MAX_SOURCE_BYTES = 5 * 1024 * 1024;

const AVATAR_SIZE = 256;
const AVATAR_QUALITY = 0.85;
const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/** Returns an error message when the file can't be used as a profile picture, otherwise `null`. */
export function avatarFileError(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return 'Please choose a JPG, PNG or WebP image.';
  if (file.size > AVATAR_MAX_SOURCE_BYTES) return 'That image is larger than 5 MB.';
  return null;
}

/**
 * Center-crops the picture to a square and shrinks it to 256x256 JPEG, returned as a data URL (about 10-40 kB), so it
 * fits comfortably in the user's Firestore document and no file storage is needed.
 */
export async function resizeToAvatar(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error('That file could not be read as an image.');
  });
  try {
    const side = Math.min(bitmap.width, bitmap.height);
    const canvas = document.createElement('canvas');
    canvas.width = AVATAR_SIZE;
    canvas.height = AVATAR_SIZE;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Your browser cannot process images.');
    // JPEG has no alpha channel; transparent PNGs would otherwise turn black.
    ctx.fillStyle = '#FFFFFF';
    ctx.fillRect(0, 0, AVATAR_SIZE, AVATAR_SIZE);
    ctx.drawImage(
      bitmap,
      (bitmap.width - side) / 2,
      (bitmap.height - side) / 2,
      side,
      side,
      0,
      0,
      AVATAR_SIZE,
      AVATAR_SIZE,
    );
    return canvas.toDataURL('image/jpeg', AVATAR_QUALITY);
  } finally {
    bitmap.close();
  }
}
