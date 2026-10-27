import { FirebaseStorage, ref, uploadBytes } from 'firebase/storage';
import { imageFileError, shrinkScreenshot } from '../../shared/utils/proof-image';

/**
 * Staff: uploads the screenshot of a refund they sent back themselves to `refundProofs/{customerId}/{kind}-{id}/`
 * (storage.rules), where the customer can see it, and returns its path for `refundPayment` to check and keep.
 */
export async function uploadRefundProof(
  storage: FirebaseStorage,
  target: { kind: 'order' | 'booking'; id: string; customerId: string },
  file: File,
): Promise<string> {
  const problem = imageFileError(file);
  if (problem) throw new Error(problem);
  const image = await shrinkScreenshot(file);
  const type = image.type || 'image/jpeg';
  const ext = type === 'image/png' ? 'png' : type === 'image/webp' ? 'webp' : 'jpg';
  const path = `refundProofs/${target.customerId}/${target.kind}-${target.id}/${Date.now()}.${ext}`;
  await uploadBytes(ref(storage, path), image, { contentType: type });
  return path;
}
