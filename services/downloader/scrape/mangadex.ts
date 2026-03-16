import type { MangaMeta } from "../types/manga";

const BASE = "https://api.mangadex.org";

/**
 * Only fetches image URLs — metadata is left blank for the user to fill in.
 */
export const scrapeMangaDex = async (chapterUrl: string): Promise<MangaMeta> => {
  const match = chapterUrl.match(/chapter\/([a-f0-9-]+)/i);
  if (!match) throw new Error("Invalid MangaDex chapter URL");
  const chapterId = match[1];

  const res = await fetch(`${BASE}/at-home/server/${chapterId}`);
  if (!res.ok) throw new Error(`MangaDex error: ${res.status}`);
  const data = await res.json();

  const imageUrls = (data.chapter.data as string[]).map(
    (file: string) => `${data.baseUrl}/data/${data.chapter.hash}/${file}`
  );

  return {
    name:      "",
    author:    "",
    tags:      [],
    genres:    [],
    ep:        "",
    source:    "mangadex",
    imageUrls,
  };
};