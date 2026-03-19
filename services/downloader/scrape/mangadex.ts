import type { MangaMeta } from "../types/manga";

const BASE = "https://api.mangadex.org";

export const scrapeMangaDex = async (chapterUrl: string): Promise<MangaMeta> => {
  const match = chapterUrl.match(/chapter\/([a-f0-9-]+)/i);
  if (!match) throw new Error("Invalid MangaDex chapter URL");
  const chapterId = match[1];

  // 1. Fetch Chapter details to get the Manga ID
  const chapterRes = await fetch(`${BASE}/chapter/${chapterId}`);
  if (!chapterRes.ok) throw new Error("Could not fetch chapter");
  const chapterJson = await chapterRes.json();
  
  const chapterAttr = chapterJson.data.attributes;
  const mangaId = chapterJson.data.relationships.find((r: any) => r.type === "manga")?.id;

  if (!mangaId) throw new Error("Could not find Manga ID for this chapter");

  // 2. Fetch Manga details + Author name (using includes[]=author)
  const mangaRes = await fetch(`${BASE}/manga/${mangaId}?includes[]=author`);
  if (!mangaRes.ok) throw new Error("Could not fetch manga metadata");
  const mangaJson = await mangaRes.json();

  const mAttr = mangaJson.data.attributes;
  
  // 3. Find the author's name inside the relationships array
  const authorObj = mangaJson.data.relationships.find((r: any) => r.type === "author");
  const authorName = authorObj?.attributes?.name || "Unknown Author";

  // 4. Fetch Image Server (to get the actual pages)
  const serverRes = await fetch(`${BASE}/at-home/server/${chapterId}`);
  const serverData = await serverRes.json();

  const imageUrls = (serverData.chapter.data as string[]).map(
    (file: string) => `${serverData.baseUrl}/data/${serverData.chapter.hash}/${file}`
  );

  return {
    name: mAttr.title.en || Object.values(mAttr.title)[0] || "Unknown",
    author: authorName, // <--- This should now be populated!
    tags: mAttr.tags.map((t: any) => t.attributes.name.en),
    genres: [],
    ep: chapterAttr.chapter ? `Chapter ${chapterAttr.chapter}` : "Oneshot",
    source: "mangadex",
    imageUrls,
  };
};