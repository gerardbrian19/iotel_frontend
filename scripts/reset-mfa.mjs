#!/usr/bin/env node
/**
 * Last-resort reset of an account's authenticator app (e.g. the only admin lost their phone): removes every second
 * factor and signs the account out everywhere. Their next sign-in asks them to set up a new app. Admins can do the
 * same for others from /admin/users.
 *
 * Usage: npm run auth:reset-mfa -- <email> [--dry-run]
 */
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { useRepoServiceAccountKey } from './admin-credentials.mjs';

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { 'dry-run': { type: 'boolean', default: false } },
});
const email = positionals[0];
if (!email) {
  console.error('Usage: npm run auth:reset-mfa -- <email> [--dry-run]');
  process.exit(1);
}

useRepoServiceAccountKey();
initializeApp();
const auth = getAuth();
const user = await auth.getUserByEmail(email);
const factors = user.multiFactor?.enrolledFactors ?? [];
console.log(`${user.email} (${user.uid}): ${factors.length} second factor(s)`);
for (const f of factors) console.log(`  - ${f.factorId} "${f.displayName ?? ''}" since ${f.enrollmentTime}`);

if (values['dry-run']) {
  console.log('Dry run: nothing changed.');
} else {
  await auth.updateUser(user.uid, { multiFactor: { enrolledFactors: null } });
  await auth.revokeRefreshTokens(user.uid);
  console.log('Removed. They are signed out and will set up a new authenticator at their next sign-in.');
}
