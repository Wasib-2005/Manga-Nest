import { Directory, File, Paths } from "expo-file-system";
import type { MangaMeta } from "../downloader/types/manga";

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

export interface ChapterInfo {
  ep: string;
  pages: number;
  savedAt: string;
}

export interface MangaLibrary {
  entries: MangaEntry[];
}

/**
 * Read entire manga library from filesystem
 * Returns all downloaded manga with their chapters and metadata
 */
export const readMangaLibrary = async (): Promise<MangaEntry[]> => {
  const root = new Directory(Paths.document, "manga");
  
  if (!root.exists) {
    return [];
  }

  const entries: MangaEntry[] = [];

  try {
    // Read index.json for basic info
    const indexFile = new File(`${root.uri}/index.json`);
    if (!indexFile.exists) {
      return [];
    }

    const indexData = JSON.parse(await indexFile.text());
    if (!Array.isArray(indexData)) return [];

    // For each manga in index
    for (const indexEntry of indexData) {
      try {
        const mangaDir = new Directory(root, indexEntry.uid);
        if (!mangaDir.exists) continue;

        // Read title.json
        const titleFile = new File(`${mangaDir.uri}/title.json`);
        if (!titleFile.exists) continue;

        const titleData = JSON.parse(await titleFile.text());

        // Read all chapters
        const chapters: ChapterInfo[] = [];
        try {
          for (const chapter of mangaDir.list()) {
            if (!(chapter instanceof Directory)) continue;

            const infoFile = new File(`${chapter.uri}/info.json`);
            if (!infoFile.exists) continue;

            try {
              const infoData = JSON.parse(await infoFile.text());
              chapters.push({
                ep: infoData.ep,
                pages: infoData.pages,
                savedAt: infoData.savedAt,
              });
            } catch {
              // skip malformed chapter
            }
          }
        } catch {
          // no chapters yet
        }

        entries.push({
          uid: indexEntry.uid,
          name: titleData.name,
          author: titleData.author || "",
          tags: titleData.tags || [],
          genres: titleData.genres || [],
          source: titleData.source,
          addedAt: titleData.addedAt,
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

/**
 * Get specific manga by UID with all chapters
 */
export const getMangaByUid = async (uid: string): Promise<MangaEntry | null> => {
  const library = await readMangaLibrary();
  return library.find(m => m.uid === uid) || null;
};

/**
 * Get chapter pages (image URLs/paths)
 */
export const getChapterPages = async (
  uid: string,
  ep: string
): Promise<string[]> => {
  const root = new Directory(Paths.document, "manga");
  const chapterDir = new Directory(new Directory(root, uid), ep);

  if (!chapterDir.exists) {
    return [];
  }

  const pages: Array<{ num: number; path: string }> = [];

  try {
    for (const file of chapterDir.list()) {
      if (file instanceof Directory) continue;

      const name = file.name;
      const match = name.match(/^(\d+)\.(webp|jpg|jpeg|png|gif)$/);
      if (!match) continue;

      const num = parseInt(match[1], 10);
      pages.push({
        num,
        path: file.uri,
      });
    }
  } catch (err) {
    console.warn(`Failed to read chapter pages for ${uid}/${ep}:`, err);
  }

  // Sort by page number
  pages.sort((a, b) => a.num - b.num);
  return pages.map(p => p.path);
};

/**
 * Filter manga by genre
 */
export const filterByGenre = (
  entries: MangaEntry[],
  genre: string
): MangaEntry[] => {
  if (!genre) return entries;
  return entries.filter(m =>
    m.genres.some(g => g.toLowerCase().includes(genre.toLowerCase()))
  );
};

/**
 * Filter manga by author
 */
export const filterByAuthor = (
  entries: MangaEntry[],
  author: string
): MangaEntry[] => {
  if (!author) return entries;
  return entries.filter(m =>
    m.author.toLowerCase().includes(author.toLowerCase())
  );
};

/**
 * Search manga by title
 */
export const searchByTitle = (
  entries: MangaEntry[],
  query: string
): MangaEntry[] => {
  if (!query) return entries;
  return entries.filter(m =>
    m.name.toLowerCase().includes(query.toLowerCase())
  );
};