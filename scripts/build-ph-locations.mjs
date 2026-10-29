#!/usr/bin/env node
/**
 * Builds the Philippine location lists used by the address form (`shared/components/ph-address-fields`):
 * Metro Manila cities, provinces, their cities/municipalities and every barangay, from the Philippine
 * Statistics Authority's PSGC (Philippine Standard Geographic Code), 2025-2Q release, as packaged in
 * github.com/jobuntux/psgc (pinned below). The output is plain JSON in public/locations/, so the form
 * works offline from the app's own files:
 *
 *   public/locations/index.json              { version, source, ncr: [[code, name]], provinces: [[code, name, [[code, name]]]] }
 *   public/locations/barangays/<area>.json   { <cityCode>: [[code, name]] }   (<area> = `ncr` or a province code)
 *
 * Codes are the 10-digit PSGC codes. Highly urbanized cities outside Metro Manila (e.g. City of Cebu) are
 * their own "province" in the PSGC, so they are listed under the province they are in (HUC_PROVINCE below).
 *
 * Usage:  npm run build:locations     (re-run when a newer PSGC release is packaged; bump PSGC_COMMIT)
 */
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = resolve(ROOT, 'public/locations');
const PSGC_VERSION = '2025-2Q';
const PSGC_COMMIT = 'bd45299dc725cc827cd53295550473caf3834a34';
const BASE = `https://raw.githubusercontent.com/jobuntux/psgc/${PSGC_COMMIT}/data/${PSGC_VERSION}`;

const NCR_REGION = '13';
const MANILA = '80600';

/** Highly urbanized cities outside Metro Manila → the province they are geographically in. */
const HUC_PROVINCE = {
  'City of Angeles': 'Pampanga',
  'City of Bacolod': 'Negros Occidental',
  'City of Baguio': 'Benguet',
  'City of Butuan': 'Agusan del Norte',
  'City of Cagayan De Oro': 'Misamis Oriental',
  'City of Cebu': 'Cebu',
  'City of Davao': 'Davao del Sur',
  'City of General Santos': 'South Cotabato',
  'City of Iligan': 'Lanao del Norte',
  'City of Iloilo': 'Iloilo',
  'City of Lapu-Lapu': 'Cebu',
  'City of Lucena': 'Quezon',
  'City of Mandaue': 'Cebu',
  'City of Olongapo': 'Zambales',
  'City of Puerto Princesa': 'Palawan',
  'City of Tacloban': 'Leyte',
  'City of Zamboanga': 'Zamboanga del Sur',
};
/** Places whose PSGC "province" code is not a province: City of Isabela (901) and BARMM's Special Geographic Area (999). */
const SPECIAL_PROVINCE = { 901: 'Basilan', 999: 'Special Geographic Area (BARMM)' };

const clean = (s) => s.replace(/\s+/g, ' ').trim();
const byName = (a, b) =>
  a[1]
    .replace(/^City of /, '')
    .localeCompare(b[1].replace(/^City of /, ''), 'en', { numeric: true });
const cityCode = (m) => `${m.regCode}${m.munCityCode}000`;

async function load(name) {
  const res = await fetch(`${BASE}/${name}.json`);
  if (!res.ok) throw new Error(`${name}.json: HTTP ${res.status}`);
  return res.json();
}

const [provinces, muncities, barangays] = await Promise.all(
  ['provinces', 'muncities', 'barangays'].map(load),
);

const realProvinces = provinces.filter((p) => !p.cityClass && p.regCode !== NCR_REGION);
const provinceByName = new Map(realProvinces.map((p) => [clean(p.provName), p]));
const provinceKey = (p) => `${p.regCode}${p.provCode}00000`;

/** Province (or `ncr`) each city/municipality is listed under. */
function areaOf(m) {
  if (m.regCode === NCR_REGION) return 'ncr';
  const own = realProvinces.find((p) => p.provCode === m.provCode && p.regCode === m.regCode);
  if (own) return provinceKey(own);
  const huc = provinces.find((p) => p.provCode === m.provCode && p.cityClass);
  const target = huc ? HUC_PROVINCE[clean(huc.provName)] : SPECIAL_PROVINCE[m.provCode];
  if (!target) throw new Error(`No province for ${m.munCityName} (${m.provCode})`);
  if (target === SPECIAL_PROVINCE['999']) return 'sga';
  const p = provinceByName.get(target);
  if (!p) throw new Error(`Unknown province ${target}`);
  return provinceKey(p);
}

const manilaParts = new Map(
  muncities
    .filter((m) => m.regCode === NCR_REGION && m.provCode === MANILA.slice(0, 3))
    .map((m) => [m.munCityCode, clean(m.munCityName)]),
);

const ncr = [];
const cities = new Map(); // area → [[code, name]]
const cityOfMun = new Map(); // munCityCode → { area, code }
for (const m of muncities) {
  // Manila's sub-municipalities (Tondo, Binondo, …) are folded into the City of Manila; its barangays name them.
  if (m.regCode === NCR_REGION && m.provCode === '806' && m.munCityCode !== MANILA) {
    cityOfMun.set(m.munCityCode, { area: 'ncr', code: `${NCR_REGION}${MANILA}000` });
    continue;
  }
  const area = areaOf(m);
  const entry = [cityCode(m), clean(m.munCityName)];
  cityOfMun.set(m.munCityCode, { area, code: entry[0] });
  if (area === 'ncr') ncr.push(entry);
  else (cities.get(area) ?? cities.set(area, []).get(area)).push(entry);
}

const brgys = new Map(); // area → { cityCode: [[code, name]] }
for (const b of barangays) {
  const city = cityOfMun.get(b.munCityCode);
  if (!city) throw new Error(`No city for barangay ${b.brgyName} (${b.munCityCode})`);
  const part = manilaParts.get(b.munCityCode);
  const name = part ? `${clean(b.brgyName)}, ${part}` : clean(b.brgyName);
  const area = brgys.get(city.area) ?? brgys.set(city.area, {}).get(city.area);
  (area[city.code] ??= []).push([`${b.regCode}${b.brgyCode}`, name]);
}

const provinceList = [
  ...realProvinces.map((p) => [provinceKey(p), clean(p.provName)]),
  ['sga', SPECIAL_PROVINCE['999']],
]
  .sort((a, b) => a[1].localeCompare(b[1], 'en'))
  .map(([code, name]) => [code, name, (cities.get(code) ?? []).sort(byName)]);

for (const [code, name, list] of provinceList) {
  if (!list.length) throw new Error(`${name} has no cities`);
  for (const [c, n] of list)
    if (!brgys.get(code)?.[c]?.length) throw new Error(`${n} has no barangays`);
}

await rm(OUT, { recursive: true, force: true });
await mkdir(resolve(OUT, 'barangays'), { recursive: true });
await writeFile(
  resolve(OUT, 'index.json'),
  JSON.stringify({
    version: PSGC_VERSION,
    source: 'Philippine Statistics Authority, Philippine Standard Geographic Code (PSGC)',
    ncr: ncr.sort(byName),
    provinces: provinceList,
  }),
);
for (const [area, byCity] of brgys) {
  for (const list of Object.values(byCity)) list.sort(byName);
  await writeFile(resolve(OUT, 'barangays', `${area}.json`), JSON.stringify(byCity));
}

const count = [...brgys.values()].reduce((n, a) => n + Object.values(a).flat().length, 0);
console.log(
  `PSGC ${PSGC_VERSION}: ${ncr.length} Metro Manila cities, ${provinceList.length} provinces, ` +
    `${provinceList.reduce((n, p) => n + p[2].length, 0)} provincial cities/municipalities, ${count} barangays → ${OUT}`,
);
