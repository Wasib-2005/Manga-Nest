import type { MangaMeta } from "../types/manga";

/**
 * nhentai: auto-fills all metadata from the API.
 * MangaDex: metadata is left blank for the user to fill in manually.
 */
export const scrapeNhentai = async (url: string): Promise<MangaMeta> => {
  const match = url.match(/\/g\/(\d+)/);
  if (!match) throw new Error("Invalid nhentai URL");
  const galleryId = match[1];

  const res = await fetch(`https://nhentai.net/api/gallery/${galleryId}`, {
    headers: { "User-Agent": "Mozilla/5.0" },
  });
  if (!res.ok) throw new Error("nhentai API error");
  const data = await res.json();

  const name   = data.title.pretty || data.title.english || `nhentai-${galleryId}`;
  const tags   = (data.tags || []).filter((t: any) => t.type === "tag")     .map((t: any) => t.name);
  const genres = (data.tags || []).filter((t: any) => t.type === "category").map((t: any) => t.name);
  const author = (data.tags || []).find( (t: any) => t.type === "artist")?.name || "";

  const imageUrls = (data.images.pages as any[]).map((p, i) => {
    const ext = p.t === "p" ? "png" : p.t === "g" ? "gif" : p.t === "w" ? "webp" : "jpg";
    return `https://i.nhentai.net/galleries/${data.media_id}/${i + 1}.${ext}`;
  });

  return { name, author, tags, genres, ep: galleryId, source: "nhentai", imageUrls };
};