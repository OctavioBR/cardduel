import { loadCatalog } from "./catalog";
import { V1 } from "./data/v1";
import type { Catalog, CatalogData } from "./types";

/**
 * Every catalog version, oldest first. A released version is never edited in place
 * (ADR-0004): card fixes go into a new version, and old ones stay loadable so stored Matches
 * replay. `data/released.json` records each released version's fingerprint; a test fails
 * if a released version changes.
 */
export const CATALOG_VERSIONS: readonly CatalogData[] = [V1];

/** The version new Matches pin: the newest one, or null before the first card set. */
export const CURRENT_CATALOG_VERSION: string | null = CATALOG_VERSIONS.at(-1)?.version ?? null;

const cache = new Map<string, Catalog>();

export function getCatalog(version: string): Catalog {
  const cached = cache.get(version);
  if (cached) return cached;
  const data = CATALOG_VERSIONS.find((v) => v.version === version);
  if (!data) throw new Error(`Unknown catalog version ${version}`);
  const catalog = loadCatalog(data);
  cache.set(version, catalog);
  return catalog;
}
