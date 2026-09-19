import { Directory, File, Paths } from "expo-file-system";
import * as FileSystemLegacy from "expo-file-system/legacy";
import {
  clearTitlePage as clearTitlePageDb,
  clearChapterTitlePage as clearChapterTitlePageDb,
  deleteChapter,
  deleteManga,
  initializeDatabase,
  listManga,
  renameChapter,
  setChapterTitlePage as setChapterTitlePageDb,
  updateManga,
} from "./database";

export interface ChapterInfo {
  ep: string;
  pages: number;
  savedAt: string;
  titlePageNum: number | null;
}

export interface MangaEntry {
  uid: string;
  name: string;
  author: string;
  tags: string[];
  genres: string[];
  source: "nhentai" | "mangadex" | "sequential" | "hentaicity" | "hentaiera" | "local";
  addedAt: string;
  chapters: ChapterInfo[];
  titlePageEp?: string | null;
  titlePageNum?: number | null;
}

const coverCache = new Map<string, string>();
const chapterFirstPageCache = new Map<string, string>();

export const invalidateCover = (uid?: string) => {
  if (uid) {
    coverCache.delete(uid);
    for (const key of chapterFirstPageCache.keys()) {
      if (key.startsWith(`${uid}:`)) chapterFirstPageCache.delete(key);
    }
  } else {
    coverCache.clear();
    chapterFirstPageCache.clear();
  }
};

export const setChapterTitlePage = async (
  uid: string,
  ep: string,
  pageNum: number,
): Promise<void> => {
  await setChapterTitlePageDb(uid, ep, pageNum);
  invalidateCover(uid);
};

export const clearChapterTitlePage = async (
  uid: string,
  ep: string,
): Promise<void> => {
  await clearChapterTitlePageDb(uid, ep);
  invalidateCover(uid);
};

const getRoot = () => new Directory(Paths.document, "manga");

/**
 * Reads relational manga metadata and chapter records from SQLite.
 */
export const readMangaLibrary = async (): Promise<MangaEntry[]> => {
  try {
    return (await listManga()).map((manga) => ({
      uid: manga.uid,
      name: manga.name,
      author: manga.author,
      tags: manga.tags,
      genres: manga.genres,
      source: manga.source,
      addedAt: manga.addedAt,
      chapters: manga.chapters,
      titlePageEp: manga.titlePageEp,
      titlePageNum: manga.titlePageNum,
    }));
  } catch (err) {
    console.error("Library Read Error:", err);
    return [];
  }
};

/**
 * Scans a chapter directory and returns sorted list of image URIs.
 */
export const getChapterPages = async (uid: string, ep: string): Promise<string[]> => {
  try {
    const root = getRoot();
    const chapterDir = new Directory(new Directory(root, uid), ep);

    if (!chapterDir.exists) return [];

    const files = chapterDir.list();
    const pages: { num: number; uri: string }[] = [];

    for (const file of files) {
      if (file instanceof Directory) continue;
      const match = file.name.match(/^(\d+)\.(webp|jpg|jpeg|png|gif)$/i);
      if (match) {
        pages.push({
          num: parseInt(match[1], 10),
          uri: file.uri,
        });
      }
    }

    return pages.sort((a, b) => a.num - b.num).map((p) => p.uri);
  } catch (err) {
    console.error("Error getting chapter pages:", err);
    return [];
  }
};

/** Updates normalized manga metadata and relations in SQLite. */
export const updateMangaMetadata = async (
  uid: string,
  updates: Partial<MangaEntry>,
) => {
  await initializeDatabase();
  await updateManga(
    uid,
    {
      name: updates.name,
      author: updates.author,
    },
    updates.tags,
    updates.genres,
  );
  return true;
};

/**
 * Saves the chosen title page in the manga relation.
 */
export const setTitlePage = async (
  uid: string,
  ep: string,
  pageNum: number, // 0-based index into the pages array
): Promise<void> => {
  await updateManga(uid, { titlePageEp: ep, titlePageNum: pageNum });
  invalidateCover(uid);
};

/**
 * Clears the title-page override so the library falls back to page 1.
 */
export const clearTitlePage = async (uid: string): Promise<void> => {
  await clearTitlePageDb(uid);
  invalidateCover(uid);
};

/**
 * Returns the URI of the title page image.
 *
 * Priority:
 *  1. In-memory cache
 *  2. SQLite title-page relation
 *  3. First numerically-sorted image in firstEp folder
 */
export const getFirstPageUri = async (
  uid: string,
  firstEp: string,
): Promise<string | null> => {
  const cached = coverCache.get(uid);
  if (cached) return cached;

  try {
    const root = getRoot();
    const mangaDir = new Directory(root, uid);

    const db = await initializeDatabase();
    const titlePage = await db.getFirstAsync<{
      titlePageEp: string | null;
      titlePageNum: number | null;
    }>(
      "SELECT title_page_ep AS titlePageEp, title_page_num AS titlePageNum FROM manga WHERE uid = ?",
      uid,
    );
    if (titlePage?.titlePageEp && titlePage.titlePageNum !== null) {
      const pages = await getChapterPages(uid, titlePage.titlePageEp);
      const uri = pages[titlePage.titlePageNum] ?? pages[0] ?? null;
      if (uri) {
        coverCache.set(uid, uri);
        return uri;
      }
    }

    // ── 2. Default: first image in firstEp ───────────────────────────────
    const chapterDir = new Directory(mangaDir, firstEp);
    if (!chapterDir.exists) return null;

    let best: { num: number; uri: string } | null = null;
    for (const file of chapterDir.list()) {
      if (file instanceof Directory) continue;
      const match = file.name.match(/^(\d+)\.(webp|jpg|jpeg|png|gif)$/i);
      if (!match) continue;
      const num = parseInt(match[1], 10);
      if (!best || num < best.num) best = { num, uri: file.uri };
    }
    const result = best?.uri ?? null;
    if (result) coverCache.set(uid, result);
    return result;
  } catch {
    return null;
  }
};

/**
 * Returns the first image from the requested chapter.
 *
 * Unlike getFirstPageUri, this intentionally ignores the manga-level title
 * page override because every chapter thumbnail represents its own chapter.
 */
export const getChapterFirstPageUri = async (
  uid: string,
  ep: string,
): Promise<string | null> => {
  const cacheKey = `${uid}:${ep}`;
  const cached = chapterFirstPageCache.get(cacheKey);
  if (cached) return cached;

  const pages = await getChapterPages(uid, ep);
  const chapter = (await listManga())
    .find((manga) => manga.uid === uid)
    ?.chapters.find((chapter) => chapter.ep === ep);
  const result = pages[chapter?.titlePageNum ?? 0] ?? pages[0] ?? null;
  if (result) chapterFirstPageCache.set(cacheKey, result);
  return result;
};

/** Renames a chapter folder and updates its relational chapter record. */
export const renameChapterEp = async (
  uid: string,
  oldEp: string,
  newEp: string,
) => {
  const titleDir = new Directory(getRoot(), uid);
  const oldDir = new Directory(titleDir, oldEp);
  const newDir = new Directory(titleDir, newEp);

  if (oldDir.exists && !newDir.exists) {
    await oldDir.move(newDir);
    await renameChapter(uid, oldEp, newEp);
    invalidateCover(uid);
  }
};

export const deleteFullManga = async (uid: string) => {
  const root = getRoot();
  const titleDir = new Directory(root, uid);
  await deleteManga(uid);
  invalidateCover(uid);
  if (titleDir.exists) titleDir.delete();
};

export const deleteChapterFiles = async (
  uid: string,
  ep: string,
): Promise<boolean> => {
  const titleDir = new Directory(getRoot(), uid);
  const chapterDir = new Directory(titleDir, ep);
  if (chapterDir.exists) chapterDir.delete();
  invalidateCover(uid);

  const remaining = titleDir.list().filter((item) => item instanceof Directory);
  if (remaining.length === 0) {
    await deleteChapter(uid, ep);
    return true;
  }
  await deleteChapter(uid, ep);
  return false;
};

/**
 * Replaces a page image file with a new image from the local filesystem or picker.
 */
export const replacePageImage = async (
  uid: string,
  ep: string,
  pageIndex: number,
  newImageUri: string,
): Promise<string[]> => {
  const root = getRoot();
  const titleDir = new Directory(root, uid);
  const chapterDir = new Directory(titleDir, ep);
  if (!chapterDir.exists) throw new Error("Chapter directory does not exist");

  const currentPages = await getChapterPages(uid, ep);
  if (pageIndex < 0 || pageIndex >= currentPages.length) {
    throw new Error("Invalid page index");
  }

  const currentUri = currentPages[pageIndex];
  const currentFileName = currentUri.split("/").pop() || `${pageIndex + 1}.jpg`;
  const numMatch = currentFileName.match(/^(\d+)\./);
  const pageNum = numMatch ? numMatch[1] : `${pageIndex + 1}`;

  const extMatch = newImageUri.match(/\.(jpg|jpeg|png|webp|gif)$/i);
  const newExt = extMatch ? extMatch[1].toLowerCase() : "jpg";
  const targetFile = new File(chapterDir, `${pageNum}.${newExt}`);

  const currentFile = new File(currentUri);
  if (currentFile.exists && currentFile.uri !== targetFile.uri) {
    currentFile.delete();
  } else if (targetFile.exists) {
    targetFile.delete();
  }

  await FileSystemLegacy.copyAsync({
    from: newImageUri,
    to: targetFile.uri,
  });

  invalidateCover(uid);
  return getChapterPages(uid, ep);
};

/** Search helper used by the UI */
export const searchByTitle = (
  entries: MangaEntry[],
  query: string,
): MangaEntry[] =>
  !query
    ? entries
    : entries.filter(
        (m) =>
          m.name.toLowerCase().includes(query.toLowerCase()) ||
          (m.author && m.author.toLowerCase().includes(query.toLowerCase())),
      );