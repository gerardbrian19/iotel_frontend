#!/usr/bin/env node
/**
 * Registers the `paymongoWebhook` Cloud Function with PayMongo (once per mode: test keys register a test webhook,
 * live keys a live one) and prints the webhook's signing secret, which the function needs as PAYMONGO_WEBHOOK_SECRET.
 * See docs/paymongo-setup.md.
 *
 * Usage:
 *   PAYMONGO_SECRET_KEY=sk_test_… npm run paymongo:webhook -- <function url>
 *   PAYMONGO_SECRET_KEY=sk_test_… npm run paymongo:webhook -- --list
 */
import { parseArgs } from 'node:util';

const EVENTS = ['checkout_session.payment.paid'];

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: { list: { type: 'boolean', default: false } },
});
const key = process.env.PAYMONGO_SECRET_KEY;
if (!key?.startsWith('sk_')) {
  console.error('Set PAYMONGO_SECRET_KEY to your PayMongo secret key (sk_test_… or sk_live_…).');
  process.exit(1);
}
const url = positionals[0];
if (!values.list && !url?.startsWith('https://')) {
  console.error('Usage: npm run paymongo:webhook -- <https function url> | --list');
  process.exit(1);
}

async function paymongo(method, path, attributes) {
  const res = await fetch(`https://api.paymongo.com/v1${path}`, {
    method,
    headers: {
      Authorization: `Basic ${Buffer.from(`${key}:`).toString('base64')}`,
      Accept: 'application/json',
      'Content-Type': 'application/json',
    },
    body: attributes ? JSON.stringify({ data: { attributes } }) : undefined,
  });
  const body = await res.json().catch(() => null);
  if (!res.ok) {
    console.error(`PayMongo answered ${res.status}:`, JSON.stringify(body?.errors ?? body, null, 2));
    process.exit(1);
  }
  return body.data;
}

const mode = key.startsWith('sk_live_') ? 'LIVE' : 'test';
const existing = await paymongo('GET', '/webhooks');

if (values.list) {
  if (!existing.length) console.log(`No ${mode} webhooks.`);
  for (const hook of existing) {
    console.log(`${hook.id}  ${hook.attributes.status}  ${hook.attributes.url}  [${hook.attributes.events.join(', ')}]`);
  }
  process.exit(0);
}

const same = existing.find((hook) => hook.attributes.url === url);
if (same) {
  console.error(
    `A ${mode} webhook for this URL already exists (${same.id}, ${same.attributes.status}). ` +
      'Its secret is only shown when it is created; delete it in the PayMongo dashboard to register it again.',
  );
  process.exit(1);
}

const hook = await paymongo('POST', '/webhooks', { url, events: EVENTS });
console.log(`Registered ${mode} webhook ${hook.id} → ${url}`);
console.log(`Events: ${hook.attributes.events.join(', ')}`);
console.log('\nSigning secret (store it, then redeploy the functions):');
console.log(`  ${hook.attributes.secret_key}`);
console.log('\n  firebase functions:secrets:set PAYMONGO_WEBHOOK_SECRET');
