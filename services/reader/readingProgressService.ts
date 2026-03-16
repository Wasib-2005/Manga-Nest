import AsyncStorage from "@react-native-async-storage/async-storage";

// Keys for AsyncStorage
const READING_PROGRESS_KEY = "manga_reading_progress";
const HIDDEN_MANGA_KEY = "manga_hidden_list";
const HIDE_PASSWORD_KEY = "manga_hide_password";

export interface ReadingProgress {
  uid: string;
  ep: string;
  currentPage: number; // 0-indexed
  timestamp: string;
}

export interface ReadingState {
  currentPage: number;
  isAutoPlay: boolean;
  autoPlaySpeed: number; // pages per second
}

/**
 * Simple hash function (not cryptographically secure, but sufficient for password obfuscation)
 */
const simpleHash = (str: string): string => {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash).toString(16);
};

/**
 * Save reading progress for a manga chapter
 * (last page user read)
 */
export const saveReadingProgress = async (
  uid: string,
  ep: string,
  pageNumber: number
): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(READING_PROGRESS_KEY);
    const progress: ReadingProgress[] = existing ? JSON.parse(existing) : [];

    // Find and update or create entry
    const idx = progress.findIndex(p => p.uid === uid && p.ep === ep);
    if (idx >= 0) {
      progress[idx] = { uid, ep, currentPage: pageNumber, timestamp: new Date().toISOString() };
    } else {
      progress.push({ uid, ep, currentPage: pageNumber, timestamp: new Date().toISOString() });
    }

    await AsyncStorage.setItem(READING_PROGRESS_KEY, JSON.stringify(progress));
  } catch (err) {
    console.warn("Failed to save reading progress:", err);
  }
};

/**
 * Get last page user read for a chapter
 */
export const getReadingProgress = async (uid: string, ep: string): Promise<number> => {
  try {
    const existing = await AsyncStorage.getItem(READING_PROGRESS_KEY);
    if (!existing) return 0;

    const progress: ReadingProgress[] = JSON.parse(existing);
    const entry = progress.find(p => p.uid === uid && p.ep === ep);
    return entry?.currentPage || 0;
  } catch (err) {
    console.warn("Failed to get reading progress:", err);
    return 0;
  }
};

/**
 * Get all reading progress entries
 */
export const getAllReadingProgress = async (): Promise<ReadingProgress[]> => {
  try {
    const existing = await AsyncStorage.getItem(READING_PROGRESS_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch (err) {
    console.warn("Failed to get all reading progress:", err);
    return [];
  }
};

/**
 * Set hide password (first time setup)
 */
export const setHidePassword = async (password: string): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(HIDE_PASSWORD_KEY);
    if (existing) {
      throw new Error("Password already set");
    }

    const hashed = simpleHash(password);
    await AsyncStorage.setItem(HIDE_PASSWORD_KEY, hashed);
  } catch (err) {
    console.warn("Failed to set hide password:", err);
    throw err;
  }
};

/**
 * Verify hide password
 */
export const verifyHidePassword = async (password: string): Promise<boolean> => {
  try {
    const existing = await AsyncStorage.getItem(HIDE_PASSWORD_KEY);
    if (!existing) return false;

    const hashed = simpleHash(password);
    return hashed === existing;
  } catch (err) {
    console.warn("Failed to verify hide password:", err);
    return false;
  }
};

/**
 * Check if hide password is set
 */
export const isHidePasswordSet = async (): Promise<boolean> => {
  try {
    const existing = await AsyncStorage.getItem(HIDE_PASSWORD_KEY);
    return !!existing;
  } catch (err) {
    console.warn("Failed to check if password is set:", err);
    return false;
  }
};

/**
 * Add manga to hidden list
 */
export const addToHiddenList = async (uid: string): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(HIDDEN_MANGA_KEY);
    const hiddenList: string[] = existing ? JSON.parse(existing) : [];

    if (!hiddenList.includes(uid)) {
      hiddenList.push(uid);
      await AsyncStorage.setItem(HIDDEN_MANGA_KEY, JSON.stringify(hiddenList));
    }
  } catch (err) {
    console.warn("Failed to add to hidden list:", err);
  }
};

/**
 * Remove manga from hidden list
 */
export const removeFromHiddenList = async (uid: string): Promise<void> => {
  try {
    const existing = await AsyncStorage.getItem(HIDDEN_MANGA_KEY);
    if (!existing) return;

    const hiddenList: string[] = JSON.parse(existing);
    const filtered = hiddenList.filter(id => id !== uid);
    await AsyncStorage.setItem(HIDDEN_MANGA_KEY, JSON.stringify(filtered));
  } catch (err) {
    console.warn("Failed to remove from hidden list:", err);
  }
};

/**
 * Get hidden manga list
 */
export const getHiddenMangaList = async (): Promise<string[]> => {
  try {
    const existing = await AsyncStorage.getItem(HIDDEN_MANGA_KEY);
    return existing ? JSON.parse(existing) : [];
  } catch (err) {
    console.warn("Failed to get hidden list:", err);
    return [];
  }
};

/**
 * Check if manga is hidden
 */
export const isMangaHidden = async (uid: string): Promise<boolean> => {
  try {
    const hiddenList = await getHiddenMangaList();
    return hiddenList.includes(uid);
  } catch (err) {
    console.warn("Failed to check if manga is hidden:", err);
    return false;
  }
};