#!/usr/bin/env node
/**
 * Seeds the `products` Firestore collection from products_categorized.json.
 * Each product becomes one document whose id is the product's own `id` (e.g. `kenwood-kmc30`).
 *
 * Uses the Firebase Admin SDK, so it bypasses firestore.rules and needs credentials:
 *   - Production: a service-account key from Firebase Console → Project settings → Service accounts,
 *     exposed as GOOGLE_APPLICATION_CREDENTIALS=/path/to/key.json (keep the key outside the repo).
 *   - Emulator:   set FIRESTORE_EMULATOR_HOST=localhost:8080; no credentials needed.
 *
 * Usage:
 *   npm run seed:products -- [file] [--dry-run] [--overwrite] [--collection=products] [--project=<id>]
 *
 * The fields listed in EXCLUDED_FIELDS are dropped before writing.
 *
 * By default existing documents are left untouched (so re-running never resets stock or prices edited
 * in the app); pass --overwrite to replace them with the JSON contents.
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const GRPC_ALREADY_EXISTS = 6;
// Spreadsheet-import bookkeeping that doesn't belong on the stored product.
const EXCLUDED_FIELDS = ['needsReview', 'reviewReasons', 'sourceRow'];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    'dry-run': { type: 'boolean', default: false },
    overwrite: { type: 'boolean', default: false },
    collection: { type: 'string', default: 'products' },
    project: { type: 'string' },
  },
});

const file = resolve(positionals[0] ?? resolve(ROOT, 'products_categorized.json'));
const collectionName = values.collection;

async function defaultProjectId() {
  const rc = JSON.parse(await readFile(resolve(ROOT, '.firebaserc'), 'utf8'));
  return rc.projects?.default;
}

function validate(products) {
  if (!Array.isArray(products)) throw new Error('Expected the JSON file to contain an array.');
  const seen = new Set();
  const valid = [];
  const problems = [];
  products.forEach((p, i) => {
    // Firestore doc ids can't be empty, contain "/" or be "." / "..".
    if (typeof p?.id !== 'string' || !p.id || p.id.includes('/') || p.id === '.' || p.id === '..') {
      problems.push(`#${i}: invalid id ${JSON.stringify(p?.id)}`);
    } else if (seen.has(p.id)) {
      problems.push(`#${i}: duplicate id "${p.id}"`);
    } else {
      seen.add(p.id);
      valid.push(p);
    }
  });
  return { valid, problems };
}

const products = JSON.parse(await readFile(file, 'utf8'));
const { valid, problems } = validate(products);
problems.forEach((msg) => console.warn(`Skipping ${msg}`));

const categoryCounts = new Map();
for (const p of valid) {
  const category = p.category ?? '(none)';
  categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
}
const byCategory = [...categoryCounts].map(([name, n]) => `  ${name}: ${n}`).join('\n');
console.log(`Read ${valid.length} products from ${file}\n${byCategory}`);

if (values['dry-run']) {
  console.log('\nDry run: nothing written.');
  process.exit(problems.length ? 1 : 0);
}

const projectId = values.project ?? process.env.GCLOUD_PROJECT ?? (await defaultProjectId());
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
console.log(
  `\nWriting to "${collectionName}" in project ${projectId} ` +
    `(${emulator ? `emulator at ${emulator}` : 'PRODUCTION'}), ` +
    `${values.overwrite ? 'overwriting existing docs' : 'skipping existing docs'}...`,
);

const db = getFirestore(initializeApp({ projectId }));
const writer = db.bulkWriter();
// Don't retry "already exists" (expected without --overwrite); retry transient errors a few times.
writer.onWriteError((err) => err.code !== GRPC_ALREADY_EXISTS && err.failedAttempts < 5);

let created = 0;
let skipped = 0;
const failures = [];

const writes = valid.map((product) => {
  const ref = db.collection(collectionName).doc(product.id);
  const data = Object.fromEntries(
    Object.entries(product).filter(([key]) => !EXCLUDED_FIELDS.includes(key)),
  );
  const op = values.overwrite ? writer.set(ref, data) : writer.create(ref, data);
  return op.then(
    () => void created++,
    (err) => {
      if (err.code === GRPC_ALREADY_EXISTS) skipped++;
      else failures.push(`${product.id}: ${err.message}`);
    },
  );
});

// BulkWriter holds the last partial batch until it's flushed, so close() must come before awaiting.
await writer.close();
await Promise.all(writes);

console.log(
  `\nDone: ${created} ${values.overwrite ? 'written' : 'created'}, ${skipped} already existed (skipped), ` +
    `${failures.length} failed.`,
);
if (failures.length) {
  failures.slice(0, 10).forEach((msg) => console.error(`  ${msg}`));
  if (failures.length > 10) console.error(`  ...and ${failures.length - 10} more`);
  process.exit(1);
}
