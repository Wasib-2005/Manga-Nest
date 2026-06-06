import type { MangaMeta } from "../types/manga";

export const NHENTAI_PATTERN = /nhentai\.net\/g\/(\d+)/i;

function extractId(url: string): string {
  const m = url.match(NHENTAI_PATTERN);
  if (!m) throw new Error("Invalid nhentai URL — expected https://nhentai.net/g/XXXXXX/");
  return m[1];
}

function pageExt(t: string): string {
  switch (t) {
    case "p": return "png";
    case "g": return "gif";
    case "w": return "webp";
    default:  return "jpg";
  }
}

const BROWSER_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Accept-Encoding": "identity",
  "Referer": "https://nhentai.net/",
  "Cache-Control": "no-cache",
};

interface NHTag  { type: string; name: string; }
interface NHPage { t: string; }

interface NHGalleryData {
  id:       number;
  media_id: string;
  title:    { pretty?: string; english?: string; japanese?: string };
  tags:     NHTag[];
  images:   { pages: NHPage[] };
}

// ─── Recover tags from raw HTML when the structured parse missed them ─────────

function recoverTagsFromHtml(html: string): NHTag[] {
  const tags: NHTag[] = [];

  // Strategy A: JSON-like pairs "type":"artist","name":"foo" anywhere in HTML
  // nhentai embeds tag objects like: {"id":123,"type":"artist","name":"foo","url":"/artist/foo/","count":42}
  const re = /\{[^{}]*?"type"\s*:\s*"([^"]+)"[^{}]*?"name"\s*:\s*"([^"]+)"[^{}]*?\}/g;
  let m: RegExpExecArray | null;
  const seen = new Set<string>();

  while ((m = re.exec(html)) !== null) {
    const type = m[1];
    const name = m[2];
    const key  = `${type}::${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      tags.push({ type, name });
    }
  }

  if (tags.length > 0) {
    console.log(`[nhentai] recoverTagsFromHtml (strategy A): found ${tags.length} tags`);
    return tags;
  }

  // Strategy B: <a class="tag" ...> markup
  // e.g. <a class="tag" href="/tag/glasses/">glasses</a>
  const tagLinkRe = /<a[^>]+href=["']\/([a-z-]+)\/([^/"']+)\/?["'][^>]*>([^<]+)<\/a>/gi;
  const KNOWN_TYPES = new Set([
    "tag", "artist", "parody", "character", "group",
    "language", "category",
  ]);

  while ((m = tagLinkRe.exec(html)) !== null) {
    const type = m[1].replace(/-/g, "_"); // e.g. "tag" → "tag"
    const name = decodeURIComponent(m[2].replace(/\+/g, " ")).trim();
    if (!KNOWN_TYPES.has(m[1])) continue;
    const key = `${type}::${name}`;
    if (!seen.has(key)) {
      seen.add(key);
      tags.push({ type: m[1], name });
    }
  }

  console.log(`[nhentai] recoverTagsFromHtml (strategy B): found ${tags.length} tags`);
  return tags;
}

// ─── Extract gallery JSON from the HTML page ──────────────────────────────────

function parseGalleryFromHtml(html: string, galleryId: string): NHGalleryData | null {
  console.log(`[nhentai] HTML length: ${html.length}`);

  // ── Pattern 1: window._gallery = JSON.parse("...escaped...") ─────────────
  const p1 = html.match(/window\._gallery\s*=\s*JSON\.parse\("([\s\S]+?)"\);/);
  if (p1) {
    console.log("[nhentai] trying pattern 1: window._gallery = JSON.parse(...)");
    try {
      const unescaped = p1[1]
        .replace(/\\"/g,  '"')
        .replace(/\\\\/g, "\\")
        .replace(/\\n/g,  "")
        .replace(/\\r/g,  "")
        .replace(/\\t/g,  "");
      const data = JSON.parse(unescaped) as NHGalleryData;
      console.log(`[nhentai] pattern 1 OK — media_id=${data.media_id} pages=${data.images?.pages?.length}`);
      return data;
    } catch (e) {
      console.log("[nhentai] pattern 1 parse error:", e);
    }
  }

  // ── Pattern 2: window._gallery = { raw object } ───────────────────────────
  const p2 = html.match(/window\._gallery\s*=\s*(\{[\s\S]+?\});\s*(?:\n|<\/script>)/);
  if (p2) {
    console.log("[nhentai] trying pattern 2: window._gallery = {...}");
    try {
      const data = JSON.parse(p2[1]) as NHGalleryData;
      console.log(`[nhentai] pattern 2 OK — media_id=${data.media_id} pages=${data.images?.pages?.length}`);
      return data;
    } catch (e) {
      console.log("[nhentai] pattern 2 parse error:", e);
    }
  }

  // ── Pattern 3: __NEXT_DATA__ (Next.js) ────────────────────────────────────
  const p3 = html.match(/<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i);
  if (p3) {
    console.log("[nhentai] trying pattern 3: __NEXT_DATA__");
    try {
      const next = JSON.parse(p3[1]);
      const find = (obj: unknown): NHGalleryData | null => {
        if (!obj || typeof obj !== "object") return null;
        const o = obj as Record<string, unknown>;
        if (o.media_id && o.images && o.title) return o as unknown as NHGalleryData;
        for (const v of Object.values(o)) {
          const r = find(v);
          if (r) return r;
        }
        return null;
      };
      const found = find(next);
      if (found) {
        console.log(`[nhentai] pattern 3 OK — media_id=${found.media_id}`);
        return found;
      }
    } catch (e) {
      console.log("[nhentai] pattern 3 parse error:", e);
    }
  }

  // ── Pattern 4: any script block containing media_id ───────────────────────
  const allScripts = [...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/gi)];
  console.log(`[nhentai] pattern 4: scanning ${allScripts.length} script blocks for media_id`);
  for (const [, scriptBody] of allScripts) {
    if (!scriptBody.includes("media_id")) continue;
    const jsonObjMatch = scriptBody.match(/(\{[\s\S]*"media_id"[\s\S]*\})/);
    if (jsonObjMatch) {
      try {
        const data = JSON.parse(jsonObjMatch[1]) as NHGalleryData;
        if (data.media_id && data.images?.pages) {
          console.log(`[nhentai] pattern 4 OK — media_id=${data.media_id}`);
          return data;
        }
      } catch { /* try next script */ }
    }
  }

  // ── Pattern 5: reconstruct from thumbnail grid (last resort) ──────────────
  console.log("[nhentai] trying pattern 5: thumbnail grid reconstruction");
  const mediaIdM = html.match(/"media_id"\s*:\s*"?(\d+)"?/) ||
                   html.match(/\/galleries\/(\d+)\/\d+t\./);
  if (mediaIdM) {
    const mId = mediaIdM[1];
    const thumbRe = new RegExp(
      `https?://t\\d*\\.nhentai\\.net/galleries/${mId}/(\\d+)t\\.(jpg|png|gif|webp)`,
      "gi"
    );
    const pageMap = new Map<number, string>();
    let tm: RegExpExecArray | null;
    while ((tm = thumbRe.exec(html)) !== null) {
      const pageNum = parseInt(tm[1], 10);
      if (!pageMap.has(pageNum)) pageMap.set(pageNum, tm[2]);
    }
    const sortedPages = [...pageMap.entries()].sort((a, b) => a[0] - b[0]);
    console.log(`[nhentai] pattern 5: media_id=${mId}, found ${sortedPages.length} thumb pages`);

    if (sortedPages.length > 0) {
      const pages: NHPage[] = sortedPages.map(([, ext]) => ({
        t: ext === "png" ? "p" : ext === "gif" ? "g" : ext === "webp" ? "w" : "j",
      }));
      const titleM =
        html.match(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
        html.match(/<title[^>]*>([^<]+)<\/title>/i);
      const rawTitle = titleM?.[1] ?? "";

      // NOTE: tags left empty here — recoverTagsFromHtml() fills them in below
      return {
        id:       parseInt(galleryId, 10),
        media_id: mId,
        title:    { pretty: rawTitle.replace(/\s*\|[^|]*$/, "").trim() },
        tags:     [],
        images:   { pages },
      };
    }
  }

  console.log("[nhentai] ALL patterns failed. First 2000 chars of HTML:");
  console.log(html.slice(0, 2000));
  return null;
}

// ─── Build full-res image URLs ────────────────────────────────────────────────

function buildImageUrls(data: NHGalleryData): string[] {
  return data.images.pages.map((p, i) => {
    const ext = pageExt(p.t);
    return `https://i.nhentai.net/galleries/${data.media_id}/${i + 1}.${ext}`;
  });
}

// ─── Main scraper ─────────────────────────────────────────────────────────────

export const scrapeNhentai = async (url: string): Promise<MangaMeta> => {
  const galleryId = extractId(url);
  console.log(`[nhentai] scraping gallery ${galleryId}`);

  let data: NHGalleryData | null = null;
  let rawHtml: string | null = null; // keep for tag recovery if needed

  // ── Attempt 1: JSON API (fast, may still work) ────────────────────────────
  try {
    const apiRes = await fetch(
      `https://nhentai.net/api/gallery/${galleryId}`,
      {
        headers: {
          ...BROWSER_HEADERS,
          "Accept": "application/json, text/javascript, */*; q=0.01",
          "X-Requested-With": "XMLHttpRequest",
        },
      }
    );
    if (apiRes.ok) {
      const json = await apiRes.json();
      if (json?.media_id && json?.images?.pages) {
        data = json as NHGalleryData;
        console.log(`[nhentai] API OK — media_id=${data.media_id} pages=${data.images.pages.length} tags=${data.tags?.length ?? 0}`);
        console.log(`[nhentai] tag sample:`, JSON.stringify(data.tags?.slice(0, 3)));
      } else {
        console.log("[nhentai] API OK but unexpected shape:", JSON.stringify(json).slice(0, 200));
      }
    } else {
      console.log(`[nhentai] API ${apiRes.status} — falling back to HTML scrape`);
    }
  } catch (e: any) {
    console.log(`[nhentai] API fetch error: ${e.message} — falling back to HTML scrape`);
  }

  // ── Attempt 2: HTML page scrape ───────────────────────────────────────────
  if (!data) {
    try {
      const pageRes = await fetch(
        `https://nhentai.net/g/${galleryId}/`,
        { headers: BROWSER_HEADERS }
      );

      console.log(`[nhentai] HTML page status: ${pageRes.status}`);

      if (pageRes.status === 403) {
        throw new Error(
          "nhentai returned 403 — Cloudflare is blocking this request.\n" +
            "Open nhentai.net in a browser on this device first to get a " +
            "CF clearance cookie, then try again."
        );
      }
      if (!pageRes.ok) {
        throw new Error(`nhentai HTTP ${pageRes.status}`);
      }

      rawHtml = await pageRes.text();
    } catch (err: any) {
      if (err.message.startsWith("nhentai")) throw err;
      throw new Error(`Network error: ${err.message}`);
    }

    data = parseGalleryFromHtml(rawHtml, galleryId);

    if (!data) {
      throw new Error(
        `nhentai: could not parse gallery ${galleryId}.\n` +
          "Check console logs for diagnostic output."
      );
    }
  }

  // ── Recover tags if the structured parse returned an empty tags array ──────
  // This happens when Pattern 5 (thumbnail reconstruction) is used, or when
  // the API/HTML parse succeeded for images but the tags array was missing.
  if ((!data.tags || data.tags.length === 0) && rawHtml) {
    console.log("[nhentai] tags missing — attempting HTML tag recovery");
    data.tags = recoverTagsFromHtml(rawHtml);
  }

  // If we went through the API path and tags are still empty, try fetching
  // the HTML page just for tags (lightweight — we already have image data).
  if ((!data.tags || data.tags.length === 0) && !rawHtml) {
    console.log("[nhentai] API path had no tags — fetching HTML page for tag recovery");
    try {
      const pageRes = await fetch(
        `https://nhentai.net/g/${galleryId}/`,
        { headers: BROWSER_HEADERS }
      );
      if (pageRes.ok) {
        rawHtml = await pageRes.text();
        data.tags = recoverTagsFromHtml(rawHtml);
      }
    } catch (e: any) {
      console.log(`[nhentai] tag-recovery HTML fetch failed: ${e.message}`);
    }
  }

  // ── Build output ──────────────────────────────────────────────────────────

  const name =
    data.title.pretty ||
    data.title.english ||
    data.title.japanese ||
    `nhentai-${galleryId}`;

  const tags   = (data.tags ?? []).filter((t) => t.type === "tag")     .map((t) => t.name);
  const genres = (data.tags ?? []).filter((t) => t.type === "category").map((t) => t.name);
  const author = (data.tags ?? []).find( (t) => t.type === "artist" )?.name ?? "";

  const imageUrls = buildImageUrls(data);

  console.log(`[nhentai] ✓ "${name}" by "${author}" — ${imageUrls.length} pages`);
  console.log(`[nhentai] tags   (${tags.length}):`, tags.slice(0, 5));
  console.log(`[nhentai] genres (${genres.length}):`, genres);
  console.log(`[nhentai] first URL: ${imageUrls[0]}`);
  console.log(`[nhentai] last  URL: ${imageUrls[imageUrls.length - 1]}`);

  if (imageUrls.length === 0) {
    throw new Error(`nhentai: gallery ${galleryId} has 0 pages.`);
  }

  return { name, author, tags, genres, ep: galleryId, source: "nhentai", imageUrls };
};

