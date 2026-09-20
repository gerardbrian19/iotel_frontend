#!/usr/bin/env node
/**
 * Seeds the `services` Firestore collection (the bookable services on /customer/services).
 * Each service becomes one document whose id is the slug below.
 *
 * Uses the Firebase Admin SDK, so it bypasses firestore.rules and needs credentials:
 *   - Production: a service-account key from Firebase Console → Project settings → Service accounts,
 *     exposed as GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (keep the key outside the repo).
 *   - Emulator:   set FIRESTORE_EMULATOR_HOST=localhost:8080; no credentials needed.
 *
 * Usage:
 *   npm run seed:services -- [--dry-run] [--overwrite] [--project=<id>]
 *
 * By default existing documents are left untouched, so re-running never resets prices edited in the console;
 * pass --overwrite to replace them.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GRPC_ALREADY_EXISTS = 6;

// `price` is the starting price in PHP; staff quote the final amount after talking to the customer.
const SERVICES = [
  {
    id: 'radio-programming',
    title: 'Radio Programming & Configuration',
    price: 500,
    description:
      'Professional programming of your radio for your specific frequencies, channels, and organization requirements.',
  },
  {
    id: 'on-site-installation',
    title: 'On-Site Installation',
    price: 3500,
    description:
      'Full on-site installation of base stations, repeaters, and antenna systems by certified technicians.',
  },
  {
    id: 'radio-repair',
    title: 'Radio Repair & Maintenance',
    price: 800,
    description:
      'Diagnosis and repair of faulty radios. Covers physical damage, software issues, and component replacement.',
  },
  {
    id: 'system-design',
    title: 'System Design & Consultation',
    price: 2000,
    description:
      'Expert consultation to design the optimal radio communication system for your business needs.',
  },
  {
    id: 'annual-maintenance',
    title: 'Annual Maintenance Contract',
    price: 12000,
    description:
      'Comprehensive annual maintenance package covering all your radio equipment with priority support.',
  },
];

const { values } = parseArgs({
  options: {
    'dry-run': { type: 'boolean', default: false },
    overwrite: { type: 'boolean', default: false },
    project: { type: 'string' },
  },
});

async function defaultProjectId() {
  const rc = JSON.parse(await readFile(resolve(ROOT, '.firebaserc'), 'utf8'));
  return rc.projects?.default;
}

console.log(`Prepared ${SERVICES.length} services:\n${SERVICES.map((s) => `  ${s.id}: ${s.title}`).join('\n')}`);

if (values['dry-run']) {
  console.log('\nDry run: nothing written.');
  process.exit(0);
}

const projectId = values.project ?? process.env.GCLOUD_PROJECT ?? (await defaultProjectId());
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
console.log(
  `\nWriting to "services" in project ${projectId} ` +
    `(${emulator ? `emulator at ${emulator}` : 'PRODUCTION'}), ` +
    `${values.overwrite ? 'overwriting existing docs' : 'skipping existing docs'}...`,
);

const db = getFirestore(initializeApp({ projectId }));
const writer = db.bulkWriter();
writer.onWriteError((err) => err.code !== GRPC_ALREADY_EXISTS && err.failedAttempts < 5);

let created = 0;
let skipped = 0;
const failures = [];

const writes = SERVICES.map(({ id, ...data }) => {
  const ref = db.collection('services').doc(id);
  const op = values.overwrite ? writer.set(ref, data) : writer.create(ref, data);
  return op.then(
    () => void created++,
    (err) => {
      if (err.code === GRPC_ALREADY_EXISTS) skipped++;
      else failures.push(`${id}: ${err.message}`);
    },
  );
});

await writer.close();
await Promise.all(writes);

console.log(
  `\nDone: ${created} ${values.overwrite ? 'written' : 'created'}, ${skipped} already existed (skipped), ` +
    `${failures.length} failed.`,
);
if (failures.length) {
  failures.forEach((msg) => console.error(`  ${msg}`));
  process.exit(1);
}
