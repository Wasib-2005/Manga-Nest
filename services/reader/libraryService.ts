import { Directory, File, Paths } from "expo-file-system";

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
  source: "nhentai" | "mangadex" | "sequential";
  addedAt: string;
  chapters: ChapterInfo[];
}

const getRoot = () => new Directory(Paths.document, "manga");

/**
 * Reads the library index and populates all manga metadata and chapters.
 */
export const readMangaLibrary = async (): Promise<MangaEntry[]> => {
  const root = getRoot();
  if (!root.exists) return [];

  try {
    const indexFile = new File(`${root.uri}/index.json`);
    if (!indexFile.exists) return [];

    const indexData = JSON.parse(await indexFile.text());
    const entries: MangaEntry[] = [];

    for (const indexEntry of indexData) {
      const mangaDir = new Directory(root, indexEntry.uid);
      const titleFile = new File(`${mangaDir.uri}/title.json`);
      if (!titleFile.exists) continue;

      const titleData = JSON.parse(await titleFile.text());
      const chapters: ChapterInfo[] = [];

      for (const item of mangaDir.list()) {
        if (!(item instanceof Directory)) continue;
        const infoFile = new File(`${item.uri}/info.json`);
        if (infoFile.exists) {
          const info = JSON.parse(await infoFile.text());
          chapters.push({
            ep: info.ep,
            pages: info.pages,
            savedAt: info.savedAt,
          });
        }
      }

      chapters.sort(
        (a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime(),
      );

      entries.push({
        uid: indexEntry.uid,
        name: titleData.name,
        author: titleData.author || "",
        tags: titleData.tags || [],
        genres: titleData.genres || [],
        source: titleData.source,
        addedAt: titleData.addedAt || new Date().toISOString(),
        chapters,
      });
    }
    return entries;
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

    console.log("sfda", chapterDir)

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

/** Updates metadata in title.json (name, author, tags, genres) */
export const updateMangaMetadata = async (
  uid: string,
  updates: Partial<MangaEntry>,
) => {
  const root = getRoot();
  const mangaDir = new Directory(root, uid);
  const titleFile = new File(`${mangaDir.uri}/title.json`);

  if (titleFile.exists) {
    const current = JSON.parse(await titleFile.text());
    const updatedData = {
      ...current,
      ...updates,
      updatedAt: new Date().toISOString(),
    };
    await titleFile.write(JSON.stringify(updatedData, null, 2));
    return true;
  }
  return false;
};

/**
 * Saves the chosen title page into title.json.
 * titlePage: null clears the override and falls back to page 1 of firstEp.
 *
 * Stored shape inside title.json:
 *   "titlePage": { "ep": "Chapter 1.1", "pageNum": 5 }
 */
export const setTitlePage = async (
  uid: string,
  ep: string,
  pageNum: number, // 0-based index into the pages array
): Promise<void> => {

  const root = getRoot();
  console.log(uid)
  const mangaDir = new Directory(root, uid);
  console.log("manga",mangaDir)
  const titleFile = new File(`${mangaDir.uri}/title.json`);

  if (!titleFile.exists) return;

  const current = JSON.parse(await titleFile.text());
  current.titlePage = { ep, pageNum };
  current.updatedAt = new Date().toISOString();
  console.log(current)
  await titleFile.write(JSON.stringify(current, null, 2));
};

/**
 * Clears the title-page override so the library falls back to page 1.
 */
export const clearTitlePage = async (uid: string): Promise<void> => {
  const root = getRoot();
  const mangaDir = new Directory(root, uid);
  const titleFile = new File(`${mangaDir.uri}/title.json`);

  if (!titleFile.exists) return;

  const current = JSON.parse(await titleFile.text());
  delete current.titlePage;
  current.updatedAt = new Date().toISOString();
  await titleFile.write(JSON.stringify(current, null, 2));
};

/**
 * Returns the URI of the title page image.
 *
 * Priority:
 *  1. title.json → titlePage.ep / titlePage.pageNum   (user-chosen page)
 *  2. First numerically-sorted image in firstEp folder (original behaviour)
 */
export const getFirstPageUri = async (
  uid: string,
  firstEp: string,
): Promise<string | null> => {
  try {
    const root = getRoot();
    const mangaDir = new Directory(root, uid);

    // ── 1. Check for stored title-page override ───────────────────────────
    const titleFile = new File(`${mangaDir.uri}/title.json`);

    if (titleFile.exists) {
      const titleData = JSON.parse(await titleFile.text());
      const stored = titleData.titlePage as { ep: string; pageNum: number } | undefined;

      if (stored) {
        const pages = await getChapterPages(uid, stored.ep);

        const uri = pages[stored.pageNum] ?? pages[0] ?? null;
        if (uri) return uri;
        // If the stored page no longer exists (e.g. chapter deleted), fall through
      }
    }

    // ── 2. Default: first image in firstEp ───────────────────────────────
    const dir = new Directory(new Directory(mangaDir, firstEp), "");
    // Re-use the chapter dir directly
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

/** Renames a chapter folder and updates internal info.json */
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
    const infoFile = new File(`${newDir.uri}/info.json`);
    if (infoFile.exists) {
      const info = JSON.parse(await infoFile.text());
      info.ep = newEp;
      await infoFile.write(JSON.stringify(info, null, 2));
    }

    // If this ep was the stored title page, update the reference
    const mangaTitleFile = new File(`${titleDir.uri}/title.json`);
    if (mangaTitleFile.exists) {
      const titleData = JSON.parse(await mangaTitleFile.text());
      if (titleData.titlePage?.ep === oldEp) {
        titleData.titlePage.ep = newEp;
        titleData.updatedAt = new Date().toISOString();
        await mangaTitleFile.write(JSON.stringify(titleData, null, 2));
      }
    }
  }
};

export const deleteFullManga = async (uid: string) => {
  const root = getRoot();
  const titleDir = new Directory(root, uid);
  const indexFile = new File(`${root.uri}/index.json`);

  if (indexFile.exists) {
    const entries = JSON.parse(await indexFile.text());
    const updated = entries.filter((e: any) => e.uid !== uid);
    await indexFile.write(JSON.stringify(updated, null, 2));
  }
  if (titleDir.exists) titleDir.delete();
};

export const deleteChapterFiles = async (
  uid: string,
  ep: string,
): Promise<boolean> => {
  const titleDir = new Directory(getRoot(), uid);
  const chapterDir = new Directory(titleDir, ep);
  if (chapterDir.exists) chapterDir.delete();

  // If the deleted chapter was the stored title page, clear the override
  const titleFile = new File(`${titleDir.uri}/title.json`);
  if (titleFile.exists) {
    const titleData = JSON.parse(await titleFile.text());
    if (titleData.titlePage?.ep === ep) {
      delete titleData.titlePage;
      titleData.updatedAt = new Date().toISOString();
      await titleFile.write(JSON.stringify(titleData, null, 2));
    }
  }

  const remaining = titleDir.list().filter((item) => item instanceof Directory);
  if (remaining.length === 0) {
    await deleteFullManga(uid);
    return true;
  }
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