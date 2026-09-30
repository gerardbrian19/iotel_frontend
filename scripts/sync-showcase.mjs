#!/usr/bin/env node
/**
 * Picks the landing page's Best Sellers and writes their public copy to `showcase/bestSellers`
 * ({ productIds, products, updatedAt }), which firestore.rules lets anyone read. Only public fields are copied
 * (never `dealerPrice`); keep them in step with StoredShowcaseProduct in src/app/core/services/showcase.service.ts.
 * After this, the app keeps prices and stock up to date whenever staff or an admin is signed in.
 *
 * By default the products are the top sellers by quantity ordered (cancelled orders don't count). Pass --ids to
 * choose them yourself.
 *
 * Uses the Firebase Admin SDK, so it bypasses firestore.rules and needs credentials:
 *   - Production: GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account-key.json
 *   - Emulator:   FIRESTORE_EMULATOR_HOST=localhost:8080
 *
 * Usage:
 *   npm run sync:showcase -- [--ids=a,b,c,d] [--count=4] [--dry-run] [--project=<id>]
 */
import { readFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { parseArgs } from 'node:util';
import { fileURLToPath } from 'node:url';
import { initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
/** firestore.rules accepts at most this many showcased products. */
const MAX_COUNT = 4;

const { values } = parseArgs({
  options: {
    ids: { type: 'string' },
    count: { type: 'string', default: String(MAX_COUNT) },
    'dry-run': { type: 'boolean', default: false },
    project: { type: 'string' },
  },
});

const count = Number(values.count);
if (!Number.isInteger(count) || count < 1 || count > MAX_COUNT) {
  console.error(`--count must be a whole number from 1 to ${MAX_COUNT}.`);
  process.exit(1);
}

async function defaultProjectId() {
  const rc = JSON.parse(await readFile(resolve(ROOT, '.firebaserc'), 'utf8'));
  return rc.projects?.default;
}

/** Mirrors toProduct() in product.service.ts, reduced to the public fields. */
function publicCopy(id, data) {
  const srp = data.srp;
  return {
    id,
    name: String(data.name ?? id),
    brand: String(data.brand ?? ''),
    category: data.category ?? 'Radio Accessories',
    description: String(data.description ?? ''),
    imageUrl: String(data.imageUrl ?? ''),
    price: typeof srp === 'number' && Number.isFinite(srp) && srp >= 0 ? srp : null,
    stock: Math.max(0, Math.floor(Number(data.stock) || 0)),
    isActive: data.isActive !== false,
  };
}

const projectId = values.project ?? process.env.GCLOUD_PROJECT ?? (await defaultProjectId());
const emulator = process.env.FIRESTORE_EMULATOR_HOST;
const db = getFirestore(initializeApp({ projectId }));

let ids;
if (values.ids) {
  ids = values.ids
    .split(',')
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length < 1 || ids.length > MAX_COUNT) {
    console.error(`--ids must list 1 to ${MAX_COUNT} product ids.`);
    process.exit(1);
  }
} else {
  const orders = await db.collection('orders').get();
  const sold = new Map();
  for (const order of orders.docs) {
    const data = order.data();
    if (data.status === 'Cancelled') continue;
    for (const item of data.items ?? []) {
      sold.set(item.productId, (sold.get(item.productId) ?? 0) + (Number(item.qty) || 0));
    }
  }
  const ranked = [...sold].sort((a, b) => b[1] - a[1]);
  console.log(`Quantities ordered (${orders.size} orders, cancelled ones excluded):`);
  ranked.forEach(([id, qty]) => console.log(`  ${id}: ${qty}`));
  ids = ranked.map(([id]) => id);
}

const products = [];
for (const id of ids) {
  if (products.length === count) break;
  const snap = await db.collection('products').doc(id).get();
  if (!snap.exists) {
    console.warn(`Skipping ${id}: no such product.`);
    continue;
  }
  const copy = publicCopy(id, snap.data());
  if (!values.ids && !copy.isActive) {
    console.warn(`Skipping ${id}: inactive.`);
    continue;
  }
  products.push(copy);
}

if (!products.length) {
  console.error('No products to showcase.');
  process.exit(1);
}

console.log('\nBest Sellers:');
products.forEach((p, i) =>
  console.log(
    `  ${i + 1}. ${p.name} (${p.id}) — ${p.price === null ? 'price on request' : `₱${p.price}`}, stock ${p.stock}`,
  ),
);

if (values['dry-run']) {
  console.log('\nDry run: nothing written.');
  process.exit(0);
}

await db
  .collection('showcase')
  .doc('bestSellers')
  .set({
    productIds: products.map((p) => p.id),
    products,
    updatedAt: FieldValue.serverTimestamp(),
  });
console.log(
  `\nWrote showcase/bestSellers in project ${projectId} (${emulator ? `emulator at ${emulator}` : 'PRODUCTION'}).`,
);
