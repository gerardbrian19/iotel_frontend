import { Injectable, WritableSignal, signal } from '@angular/core';

/** A place in a dropdown: its 10-digit PSGC code and name. */
export interface PhPlace {
  code: string;
  name: string;
}

export interface PhProvince extends PhPlace {
  cities: PhPlace[];
}

/** `public/locations/index.json`, built by `npm run build:locations` (scripts/build-ph-locations.mjs). */
interface LocationIndexFile {
  version: string;
  ncr: [string, string][];
  provinces: [string, string, [string, string][]][];
}

export interface PhLocationIndex {
  version: string;
  ncr: PhPlace[];
  provinces: PhProvince[];
}

/** Barangays file key for an area: `ncr` or the province's code. */
export type BarangayArea = string;

const toPlace = ([code, name]: [string, string]): PhPlace => ({ code, name });

/**
 * Philippine regions, provinces, cities/municipalities and barangays (PSA PSGC) for the address form,
 * read from the app's own `public/locations/` files: the index once, then one barangay file per province
 * (or Metro Manila) when a city in it is picked. Both are cached for the session.
 */
@Injectable({ providedIn: 'root' })
export class PhLocationService {
  private readonly _index = signal<PhLocationIndex | null>(null);
  private readonly _indexError = signal(false);
  private readonly _barangays = signal<Record<BarangayArea, Record<string, PhPlace[]>>>({});
  private readonly _loadingAreas = signal<ReadonlySet<BarangayArea>>(new Set());
  private readonly _failedAreas = signal<ReadonlySet<BarangayArea>>(new Set());
  private indexRequest: Promise<void> | null = null;
  private readonly areaRequests = new Map<BarangayArea, Promise<void>>();

  /** `null` until loaded. */
  readonly index = this._index.asReadonly();
  readonly indexError = this._indexError.asReadonly();
  readonly loadingAreas = this._loadingAreas.asReadonly();
  readonly failedAreas = this._failedAreas.asReadonly();

  /** Loads the province / city lists (once; retried after a failure). */
  loadIndex(): Promise<void> {
    if (this._index()) return Promise.resolve();
    this.indexRequest ??= fetchJson<LocationIndexFile>('/locations/index.json')
      .then((file) => {
        this._index.set({
          version: file.version,
          ncr: file.ncr.map(toPlace),
          provinces: file.provinces.map(([code, name, cities]) => ({
            code,
            name,
            cities: cities.map(toPlace),
          })),
        });
        this._indexError.set(false);
      })
      .catch((err) => {
        console.error('Could not load the location list', err);
        this._indexError.set(true);
        this.indexRequest = null;
      });
    return this.indexRequest;
  }

  /** Loads the barangays of every city in an area (`ncr` or a province code), once. */
  loadBarangays(area: BarangayArea): Promise<void> {
    if (this._barangays()[area]) return Promise.resolve();
    let request = this.areaRequests.get(area);
    if (!request) {
      this.setFlag(this._loadingAreas, area, true);
      this.setFlag(this._failedAreas, area, false);
      request = fetchJson<Record<string, [string, string][]>>(`/locations/barangays/${area}.json`)
        .then((file) => {
          const byCity: Record<string, PhPlace[]> = {};
          for (const [city, list] of Object.entries(file)) byCity[city] = list.map(toPlace);
          this._barangays.update((all) => ({ ...all, [area]: byCity }));
        })
        .catch((err) => {
          console.error(`Could not load the barangays of ${area}`, err);
          this.setFlag(this._failedAreas, area, true);
          this.areaRequests.delete(area);
        })
        .finally(() => this.setFlag(this._loadingAreas, area, false));
      this.areaRequests.set(area, request);
    }
    return request;
  }

  /** The barangays of a city, or `null` while its area isn't loaded. Reads a signal, so it works in `computed`. */
  barangays(area: BarangayArea, cityCode: string): PhPlace[] | null {
    const loaded = this._barangays()[area];
    return loaded ? (loaded[cityCode] ?? []) : null;
  }

  private setFlag(
    flags: WritableSignal<ReadonlySet<BarangayArea>>,
    area: BarangayArea,
    on: boolean,
  ): void {
    flags.update((set) => {
      const next = new Set(set);
      if (on) next.add(area);
      else next.delete(area);
      return next;
    });
  }
}

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
  return (await res.json()) as T;
}
