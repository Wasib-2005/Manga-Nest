import { scrapeNhentai } from "./scrape/nhentai";
import { scrapeMangaDex } from "./scrape/mangadex";
import { scrapeSequential, SEQUENTIAL_PATTERN } from "./scrape/sequential";
import type { MangaMeta } from "./types/manga";
import { scrapeHentaiCity } from "./scrape/hentaiCity";
import { scrapeHentaiera } from "./scrape/hentaiera";

export const lookupManga = async (url: string): Promise<MangaMeta> => {
  if (url.includes("nhentai.net")) return scrapeNhentai(url); 

  if (url.includes("mangadex.org")) return scrapeMangaDex(url); 
  
  if (url.includes("hentaicity.com")) return scrapeHentaiCity(url); 
  
  if (url.includes("hentaiera.com")) return scrapeHentaiera(url); 
  
  if (SEQUENTIAL_PATTERN.test(url)) return scrapeSequential(url); 
  throw new Error(
    "Unsupported source or a direct image URL (e.g. .../05.jpg)",
  );
};

export { downloadManga } from "./mangaDownloader";
