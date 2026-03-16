import { scrapeNhentai }  from "./scrape/nhentai";
import { scrapeMangaDex } from "./scrape/mangadex";
import type { MangaMeta } from "./types/manga";

export const lookupManga = async (url: string): Promise<MangaMeta> => {
  if (url.includes("nhentai.net"))  return scrapeNhentai(url);
  if (url.includes("mangadex.org")) return scrapeMangaDex(url);
  throw new Error("Unsupported source — use nhentai.net or mangadex.org");
};

export { downloadManga } from "./mangaDownloader";