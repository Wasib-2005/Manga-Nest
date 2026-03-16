import { Directory, File, Paths } from "expo-file-system";

export interface MangaEntry {
  uid:      string;
  name:     string;
  author:   string;
  tags:     string[];
  genres:   string[];
  source:   "nhentai" | "mangadex" | "sequential";
  addedAt:  string;
  chapters: ChapterInfo[];
}

export interface ChapterInfo {
  ep:      string;
  pages:   number;
  savedAt: string;
}

export const readMangaLibrary = async (): Promise<MangaEntry[]> => {
  const root = new Directory(Paths.document, "manga");
  if (!root.exists) return [];

  const entries: MangaEntry[] = [];
  try {
    const indexFile = new File(`${root.uri}/index.json`);
    if (!indexFile.exists) return [];

    const indexData = JSON.parse(await indexFile.text());
    if (!Array.isArray(indexData)) return [];

    for (const indexEntry of indexData) {
      try {
        const mangaDir = new Directory(root, indexEntry.uid);
        if (!mangaDir.exists) continue;

        const titleFile = new File(`${mangaDir.uri}/title.json`);
        if (!titleFile.exists) continue;
        const titleData = JSON.parse(await titleFile.text());

        const chapters: ChapterInfo[] = [];
        try {
          for (const chapter of mangaDir.list()) {
            if (!(chapter instanceof Directory)) continue;
            const infoFile = new File(`${chapter.uri}/info.json`);
            if (!infoFile.exists) continue;
            try {
              const info = JSON.parse(await infoFile.text());
              chapters.push({ ep: info.ep, pages: info.pages, savedAt: info.savedAt });
            } catch { /* skip */ }
          }
        } catch { /* no chapters yet */ }

        // Sort chapters by savedAt ascending
        chapters.sort((a, b) => new Date(a.savedAt).getTime() - new Date(b.savedAt).getTime());

        entries.push({
          uid:     indexEntry.uid,
          name:    titleData.name,
          author:  titleData.author  || "",
          tags:    titleData.tags    || [],
          genres:  titleData.genres  || [],
          source:  titleData.source,
          addedAt: titleData.addedAt || new Date().toISOString(),
          chapters,
        });
      } catch (err) {
        console.warn(`Failed to read manga ${indexEntry.uid}:`, err);
      }
    }
  } catch (err) {
    console.warn("Failed to read manga library:", err);
  }

  return entries;
};

export const getMangaByUid = async (uid: string): Promise<MangaEntry | null> => {
  const library = await readMangaLibrary();
  return library.find(m => m.uid === uid) || null;
};

export const getChapterPages = async (uid: string, ep: string): Promise<string[]> => {
  const root       = new Directory(Paths.document, "manga");
  const chapterDir = new Directory(new Directory(root, uid), ep);
  if (!chapterDir.exists) return [];

  const pages: { num: number; path: string }[] = [];
  try {
    for (const file of chapterDir.list()) {
      if (file instanceof Directory) continue;
      const match = file.name.match(/^(\d+)\.(webp|jpg|jpeg|png|gif)$/);
      if (!match) continue;
      pages.push({ num: parseInt(match[1], 10), path: file.uri });
    }
  } catch (err) {
    console.warn(`Failed to read pages for ${uid}/${ep}:`, err);
  }

  pages.sort((a, b) => a.num - b.num);
  return pages.map(p => p.path);
};

/** Returns the file URI of the first page of the first chapter, or null. */
export const getFirstPageUri = async (uid: string, firstEp: string): Promise<string | null> => {
  try {
    const root  = new Directory(Paths.document, "manga");
    const dir   = new Directory(new Directory(root, uid), firstEp);
    if (!dir.exists) return null;

    let best: { num: number; uri: string } | null = null;
    for (const file of dir.list()) {
      if (file instanceof Directory) continue;
      const match = file.name.match(/^(\d+)\.(webp|jpg|jpeg|png|gif)$/);
      if (!match) continue;
      const num = parseInt(match[1], 10);
      if (!best || num < best.num) best = { num, uri: file.uri };
    }
    return best?.uri ?? null;
  } catch {
    return null;
  }
};

export const filterByGenre = (entries: MangaEntry[], genre: string): MangaEntry[] =>
  !genre ? entries : entries.filter(m => m.genres.some(g => g.toLowerCase().includes(genre.toLowerCase())));

export const filterByAuthor = (entries: MangaEntry[], author: string): MangaEntry[] =>
  !author ? entries : entries.filter(m => m.author.toLowerCase().includes(author.toLowerCase()));

export const searchByTitle = (entries: MangaEntry[], query: string): MangaEntry[] =>
  !query ? entries : entries.filter(m => m.name.toLowerCase().includes(query.toLowerCase()));