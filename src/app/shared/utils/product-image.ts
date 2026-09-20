export const PLACEHOLDER_IMAGE = '/images/placeholder.svg';

/** `(error)` handler for product `<img>`s: swaps a broken remote image for the local placeholder, once. */
export function onImageError(event: Event): void {
  const img = event.target as HTMLImageElement;
  if (!img.src.endsWith(PLACEHOLDER_IMAGE)) img.src = PLACEHOLDER_IMAGE;
}
