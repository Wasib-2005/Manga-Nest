import type { MangaMeta } from "../types/manga";

export const scrapeMangaDex = async (chapterUrl: string): Promise<MangaMeta> => {
  const match = chapterUrl.match(/chapter\/([a-f0-9-]+)/i);
  if (!match) throw new Error("Invalid MangaDex chapter URL");

  const chapterId = match[1];
  const res = await fetch(`https://api.mangadex.org/at-home/server/${chapterId}`);
  if (!res.ok) throw new Error("Failed to fetch image server");

  const data      = await res.json();
  const baseUrl   = data.baseUrl;
  const hash      = data.chapter.hash;
  const imageUrls = (data.chapter.data as string[]).map(
    file => `${baseUrl}/data/${hash}/${file}`
  );

  return {
    name:      `MangaDex Chapter ${chapterId}`,
    author:    "",
    tags:      [],
    genres:    [],
    ep:        `ch-${chapterId}`,
    source:    "mangadex",
    imageUrls,
  };
};