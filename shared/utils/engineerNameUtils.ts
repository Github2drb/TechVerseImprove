/**
 * Engineer Name Normalization & Matching Utilities
 * Location: shared/utils/engineerNameUtils.ts
 * Purpose: Ensure consistent engineer name matching across data.json & master list
 */

/**
 * Normalizes an engineer name for safe comparison.
 * Handles: case differences, extra spaces, parenthetical content, trailing initials.
 */
export function normalizeEngineerName(name: string): string {
  if (!name || typeof name !== 'string') return '';
  return name
    .trim()
    .toLowerCase()
    // Remove parenthetical content like "(Ampere)", "(PAES)", etc.
    .replace(/\s*\([^)]*\)\s*/g, ' ')
    // Remove common trailing initials/suffixes that vary between sources (e.g., " M", " C", " HC")
    .replace(/\s+[a-z]{1,3}$/i, '')
    // Collapse multiple spaces
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Finds the canonical engineer name from a master list that matches a raw/assignment name.
 * @param rawName - The name as it appears in assignments/data.json
 * @param masterList - Array of engineer objects from engineers_master_list.json
 * @returns The canonical name from the master list, or null if no match
 */
export function findCanonicalEngineerName(
  rawName: string,
  masterList: Array<{ name: string; id?: string; initials?: string }>
): string | null {
  if (!rawName || !masterList || masterList.length === 0) return null;

  const normalizedRaw = normalizeEngineerName(rawName);

  // 1. Exact normalized match
  const exactMatch = masterList.find(
    e => normalizeEngineerName(e.name) === normalizedRaw
  );
  if (exactMatch) return exactMatch.name;

  // 2. Fuzzy match: check if one normalized name contains the other
  const fuzzyMatch = masterList.find(e => {
    const normalizedMaster = normalizeEngineerName(e.name);
    return normalizedMaster.includes(normalizedRaw) ||
           normalizedRaw.includes(normalizedMaster);
  });
  if (fuzzyMatch) return fuzzyMatch.name;

  // 3. Close-match fallback for typos (max 2 character differences)
  for (const master of masterList) {
    const normMaster = normalizeEngineerName(master.name);
    if (Math.abs(normMaster.length - normalizedRaw.length) <= 3) {
      let diff = 0;
      const maxLen = Math.max(normMaster.length, normalizedRaw.length);
      for (let i = 0; i < maxLen; i++) {
        if (normMaster[i] !== normalizedRaw[i]) diff++;
      }
      if (diff <= 2) return master.name;
    }
  }

  return null;
}

/**
 * Validates an engineer name against the master list.
 * @returns { valid: boolean, suggestion?: string }
 */
export function validateEngineerName(
  name: string,
  masterList: Array<{ name: string }>
): { valid: boolean; suggestion?: string } {
  const canonical = findCanonicalEngineerName(name, masterList);

  if (canonical) {
    if (canonical.toLowerCase() === name.toLowerCase().trim()) {
      return { valid: true };
    }
    return { valid: false, suggestion: canonical };
  }

  return { valid: false };
}
