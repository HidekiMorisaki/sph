type BrowserStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Transfer existing engagement preferences before mounting the shared search. */
export function migrateEngagementStorage(userId: number, storage?: BrowserStorage): void {
 try {
  const target = storage ?? localStorage;
  const pairs = ['tab','collapsed','selected-filter','category'].map(setting =>
   [`projects-search-${setting}:${userId}`, `engagements-search-${setting}:${userId}`]);
  pairs.push(['master-size:/v1/projects','master-size:/v1/engagements']);
  for (const [oldKey,newKey] of pairs) {
   const previous = target.getItem(oldKey);
   if (previous === null) continue;
   if (target.getItem(newKey) === null) target.setItem(newKey,previous);
   target.removeItem(oldKey);
  }
 } catch { /* Optional browser storage may be unavailable; normal defaults work. */ }
}
