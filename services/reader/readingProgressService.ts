/**
 * readingProgressService.ts
 *
 * Persists:
 *  - per-chapter page position   →  "manga_reading_progress"  (legacy array, kept for compat)
 *                                    progress:{uid}:{ep}       (fast individual keys)
 *  - recently-read order         →  "recentlyRead"            [{uid, ep, readAt, page, totalPages}]
 *  - hidden manga list           →  "manga_hidden_list"       string[]
 *  - hide password               →  "manga_hide_password"     hashed string
 */

import AsyncStorage from "@react-native-async-storage/async-storage";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Legacy type — kept so existing callers don't break */
export interface ReadingProgress {
  uid:         string;
  ep:          string;
  currentPage: number;   // 0-indexed
  timestamp:   string;
}

export interface ReadingState {
  currentPage:   number;
  isAutoPlay:    boolean;
  autoPlaySpeed: number;
}

/** New type — used for "Recently Read" sort and progress badges */
export interface RecentEntry {
  uid:        string;
  ep:         string;
  readAt:     string;   // ISO timestamp
  page:       number;   // 0-based last page
  totalPages: number;
}

// ─── Keys ─────────────────────────────────────────────────────────────────────

const LEGACY_PROGRESS_KEY = "manga_reading_progress";
const HIDDEN_KEY          = "manga_hidden_list";
const PASS_KEY            = "manga_hide_password";
const RECENT_KEY          = "recentlyRead";

const fastProgressKey = (uid: string, ep: string) => `progress:${uid}:${ep}`;

// ─── Password hashing (simple, non-crypto — matches original behaviour) ───────

const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
};

// ─── Reading progress ─────────────────────────────────────────────────────────

/**
 * Save reading progress for a chapter.
 * Writes to both the fast individual key AND the legacy array,
 * and updates the recently-read list.
 */
export const saveReadingProgress = async (
  uid:        string,
  ep:         string,
  page:       number,
  totalPages: number = 0
): Promise<void> => {
  try {
    // Fast path — individual key (used by new code)
    await AsyncStorage.setItem(fastProgressKey(uid, ep), String(page));

    // Legacy array update (used by any old callers)
    const existing = await AsyncStorage.getItem(LEGACY_PROGRESS_KEY);
    const progress: ReadingProgress[] = existing ? JSON.parse(existing) : [];
    const idx = progress.findIndex((p) => p.uid === uid && p.ep === ep);
    const entry: ReadingProgress = {
      uid,
      ep,
      currentPage: page,
      timestamp:   new Date().toISOString(),
    };
    if (idx >= 0) progress[idx] = entry;
    else          progress.push(entry);
    await AsyncStorage.setItem(LEGACY_PROGRESS_KEY, JSON.stringify(progress));

    // Recently-read list
    await touchRecentlyRead(uid, ep, page, totalPages);
  } catch (err) {
    console.warn("saveReadingProgress error:", err);
  }
};

/**
 * Get last page user read for a chapter.
 * Tries fast key first, falls back to legacy array.
 */
export const getReadingProgress = async (uid: string, ep: string): Promise<number> => {
  try {
    // Fast path
    const fast = await AsyncStorage.getItem(fastProgressKey(uid, ep));
    if (fast !== null) return parseInt(fast, 10);

    // Legacy fallback
    const existing = await AsyncStorage.getItem(LEGACY_PROGRESS_KEY);
    if (!existing) return 0;
    const progress: ReadingProgress[] = JSON.parse(existing);
    const entry = progress.find((p) => p.uid === uid && p.ep === ep);
    return entry?.currentPage ?? 0;
  } catch {
    return 0;
  }
};

/**
 * Get all reading progress entries (legacy format).
 */
export const getAllReadingProgress = async (): Promise<ReadingProgress[]> => {
  try {
    const existing = await AsyncStorage.getItem(LEGACY_PROGRESS_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch {
    return [];
  }
};

// ─── Recently Read list ───────────────────────────────────────────────────────
// Ordered newest-first. Each uid appears once (latest ep wins).

export async function getRecentlyRead(): Promise<RecentEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(RECENT_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function touchRecentlyRead(
  uid:        string,
  ep:         string,
  page:       number,
  totalPages: number
): Promise<void> {
  try {
    const list = await getRecentlyRead();
    const filtered = list.filter((e) => e.uid !== uid);
    const entry: RecentEntry = {
      uid,
      ep,
      readAt: new Date().toISOString(),
      page,
      totalPages,
    };
    const next = [entry, ...filtered].slice(0, 500);
    await AsyncStorage.setItem(RECENT_KEY, JSON.stringify(next));
  } catch (e) {
    console.warn("touchRecentlyRead error:", e);
  }
}

/** Returns a map uid → RecentEntry for O(1) lookups in the library screen. */
export async function getRecentlyReadMap(): Promise<Map<string, RecentEntry>> {
  const list = await getRecentlyRead();
  return new Map(list.map((e) => [e.uid, e]));
}

// ─── Hidden manga ─────────────────────────────────────────────────────────────

export const getHiddenMangaList = async (): Promise<string[]> => {
  try {
    const raw = await AsyncStorage.getItem(HIDDEN_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
};

export const addToHiddenList = async (uid: string): Promise<void> => {
  try {
    const list = await getHiddenMangaList();
    if (!list.includes(uid)) {
      await AsyncStorage.setItem(HIDDEN_KEY, JSON.stringify([...list, uid]));
    }
  } catch (err) {
    console.warn("addToHiddenList error:", err);
  }
};

export const removeFromHiddenList = async (uid: string): Promise<void> => {
  try {
    const list = await getHiddenMangaList();
    await AsyncStorage.setItem(
      HIDDEN_KEY,
      JSON.stringify(list.filter((id) => id !== uid))
    );
  } catch (err) {
    console.warn("removeFromHiddenList error:", err);
  }
};

export const isMangaHidden = async (uid: string): Promise<boolean> => {
  try {
    const list = await getHiddenMangaList();
    return list.includes(uid);
  } catch {
    return false;
  }
};

// ─── Hide password ────────────────────────────────────────────────────────────

export const setHidePassword = async (password: string): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(PASS_KEY);
    if (existing) throw new Error("Password already set");
    await AsyncStorage.setItem(PASS_KEY, simpleHash(password));
  } catch (err) {
    console.warn("setHidePassword error:", err);
    throw err;
  }
};

export const verifyHidePassword = async (password: string): Promise<boolean> => {
  try {
    const stored = await AsyncStorage.getItem(PASS_KEY);
    if (!stored) return false;
    return simpleHash(password) === stored;
  } catch {
    return false;
  }
};

export const isHidePasswordSet = async (): Promise<boolean> => {
  try {
    return !!(await AsyncStorage.getItem(PASS_KEY));
  } catch {
    return false;
  }
};