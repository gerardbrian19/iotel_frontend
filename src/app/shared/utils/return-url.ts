import { UserRole } from '../../core/models';

/**
 * The `returnUrl` query param set by `authGuard`, if it points into the given role's own portal (never an outside URL
 * or another portal); null otherwise.
 */
export function safeReturnUrl(url: string | null, role: UserRole): string | null {
  return url && (url === `/${role}` || url.startsWith(`/${role}/`) || url.startsWith(`/${role}?`))
    ? url
    : null;
}
