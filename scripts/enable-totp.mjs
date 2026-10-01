#!/usr/bin/env node
/**
 * Turns on authenticator-app (TOTP) multi-factor sign-in for the project. It isn't in the Firebase Console; needs the
 * Identity Platform upgrade. Run once. `--check` only prints the current setting.
 *
 * Usage: npm run auth:enable-totp -- [--check]
 */
import { parseArgs } from 'node:util';
import { initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { useRepoServiceAccountKey } from './admin-credentials.mjs';

const { values } = parseArgs({ options: { check: { type: 'boolean', default: false } } });

useRepoServiceAccountKey();
initializeApp();
const configs = getAuth().projectConfigManager();

if (!values.check) {
  await configs.updateProjectConfig({
    multiFactorConfig: {
      // 5 = also accept codes up to 2.5 minutes early or late (phone clock drift).
      providerConfigs: [{ state: 'ENABLED', totpProviderConfig: { adjacentIntervals: 5 } }],
    },
  });
  console.log('TOTP multi-factor sign-in enabled.');
}

const { multiFactorConfig } = (await configs.getProjectConfig()).toJSON();
console.log(JSON.stringify(multiFactorConfig ?? { note: 'no multi-factor config' }, null, 2));
