import { Directory, Paths } from "expo-file-system";
import {
  clearTitlePage as clearTitlePageDb,
  deleteChapter,
  deleteManga,
  initializeDatabase,
  listManga,
  renameChapter,
  updateManga,
} from "./database";

export interface ChapterInfo {
  ep: string;
  pages: number;
  savedAt: string;
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
}

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
};

/**
 * Clears the title-page override so the library falls back to page 1.
 */
export const clearTitlePage = async (uid: string): Promise<void> => {
  await clearTitlePageDb(uid);
};

/**
 * Returns the URI of the title page image.
 *
 * Priority:
 *  1. SQLite title-page relation
 *  2. First numerically-sorted image in firstEp folder (original behaviour)
 */
export const getFirstPageUri = async (
  uid: string,
  firstEp: string,
): Promise<string | null> => {
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
      if (uri) return uri;
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
    return best?.uri ?? null;
  } catch {
    return null;
  }
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
  }
};

export const deleteFullManga = async (uid: string) => {
  const root = getRoot();
  const titleDir = new Directory(root, uid);
  await deleteManga(uid);
  if (titleDir.exists) titleDir.delete();
};

export const deleteChapterFiles = async (
  uid: string,
  ep: string,
): Promise<boolean> => {
  const titleDir = new Directory(getRoot(), uid);
  const chapterDir = new Directory(titleDir, ep);
  if (chapterDir.exists) chapterDir.delete();

  const remaining = titleDir.list().filter((item) => item instanceof Directory);
  if (remaining.length === 0) {
    await deleteChapter(uid, ep);
    return true;
  }
  await deleteChapter(uid, ep);
  return false;
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