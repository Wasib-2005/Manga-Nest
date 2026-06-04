import { scrapeNhentai }                    from "./scrape/nhentai";
import { scrapeMangaDex }                   from "./scrape/mangadex";
import { scrapeSequential, SEQUENTIAL_PATTERN } from "./scrape/sequential";
import type { MangaMeta }                   from "./types/manga";
import { scrapeHentaiCity } from "./scrape/hentaiCity";

export const lookupManga = async (url: string): Promise<MangaMeta> => {
  if (url.includes("nhentai.net"))    return scrapeNhentai(url);     // fetch + auto-fill
  if (url.includes("mangadex.org"))   return scrapeMangaDex(url);    // fetch images, no meta
  if (url.includes("hentaicity.com")) return scrapeHentaiCity(url); // fetch + auto-fill
  if (SEQUENTIAL_PATTERN.test(url))   return scrapeSequential(url);  // instant, no scan yet
  throw new Error(
    "Unsupported source — mangadex.org, or a direct image URL (e.g. .../05.jpg)"
  );
};

export { downloadManga } from "./mangaDownloader";