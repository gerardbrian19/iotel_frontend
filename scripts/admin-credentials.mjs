/**
 * Shared by the auth scripts: uses GOOGLE_APPLICATION_CREDENTIALS if set, otherwise the service-account key in the
 * repo root (`*-firebase-adminsdk-*.json`, gitignored).
 */
import { readdirSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export function useRepoServiceAccountKey() {
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) return;
  const key = readdirSync(ROOT).find((f) => /-firebase-adminsdk-.*\.json$/.test(f));
  if (!key) {
    console.error(
      'No credentials: set GOOGLE_APPLICATION_CREDENTIALS or put the service-account key in the repo root.',
    );
    process.exit(1);
  }
  process.env.GOOGLE_APPLICATION_CREDENTIALS = join(ROOT, key);
}
