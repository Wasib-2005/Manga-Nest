import type { MangaMeta } from "../types/manga";

const DIAGNOSTIC = false;

const HEADERS = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 " +
    "(KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
  "Accept":
    "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8",
  "Accept-Language": "en-US,en;q=0.9",
  "Referer": "https://www.hentaicity.com/",
  "Cache-Control": "no-cache",
};

export const HENTAICITY_PATTERN =
  /^https?:\/\/(?:www\.)?hentaicity\.com\/gallery\/.+\.html/i;

// ─── Mini HTML parsers ────────────────────────────────────────────────────────

function getMeta(html: string, prop: string): string {
  for (const re of [
    new RegExp(`<meta[^>]+(?:property|name)=["']${prop}["'][^>]+content=["']([^"']+)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${prop}["']`, "i"),
  ]) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function getTitle(html: string): string {
  return (
    getMeta(html, "og:title") ||
    getMeta(html, "twitter:title") ||
    (html.match(/<title[^>]*>([^<]{2,120})<\/title>/i)?.[1] ?? "").trim()
  );
}

function getAuthor(html: string): string {
  const meta = getMeta(html, "author");
  if (meta) return meta;
  for (const re of [
    /(?:artist|author|by)[^<]*?<a[^>]*>([^<]{2,60})<\/a>/i,
    /<span[^>]*class=["'][^"']*(?:artist|author)[^"']*["'][^>]*>([^<]{2,60})<\/span>/i,
  ]) {
    const m = html.match(re);
    if (m?.[1]) return m[1].trim();
  }
  return "";
}

function getTags(html: string): string[] {
  const tags = new Set<string>();
  const re = /<a[^>]+href=["'][^"']*\/tags?\/[^"']+["'][^>]*>([^<]{1,50})<\/a>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const t = m[1].trim();
    if (t) tags.add(t);
  }
  return Array.from(tags);
}

function getEpisode(url: string, html: string): string {
  const slugM = url.match(/\/gallery\/.+-(\d+(?:\.\d+)?)-[a-z0-9]{6,}\.html$/i);
  if (slugM) return slugM[1];
  const title = getTitle(html);
  const chM = title.match(/(?:ch(?:apter)?|vol(?:ume)?|ep(?:isode)?)\s*\.?\s*(\d+(?:\.\d+)?)/i);
  if (chM) return chM[1];
  return "1";
}

// ─── Strip thumbnail suffix → full-res URL ────────────────────────────────────
// hentaicity uses "-t" suffix for thumbnails:
//   https://cdn1.images.hentaicity.com/galleries/0191/62105/HASH-t.jpg  ← thumb
//   https://cdn1.images.hentaicity.com/galleries/0191/62105/HASH.jpg    ← full

function toFullRes(u: string): string {
  return u.replace(/-t(\.(jpg|jpeg|png|webp|gif))(\?.*)?$/i, "$1$3");
}

function isFullResUrl(u: string): boolean {
  // Must be from the hentaicity CDN and look like a gallery image
  return (
    /cdn\d*\.images\.hentaicity\.com\/galleries\//i.test(u) ||
    /hentaicity\.com\/.*\.(jpg|jpeg|png|webp|gif)/i.test(u)
  );
}

// ─── Image URL extraction ─────────────────────────────────────────────────────

function getImageUrls(html: string): { urls: string[]; strategy: string } {

  // ── Strategy A: JSON array var assignment ─────────────────────────────────
  const jsonVarPatterns: RegExp[] = [
    /(?:var\s+|window\.)(?:pages|images?|gallery|urls?|data)\s*=\s*(\[[^\]]{10,}\])/i,
    /"(?:pages|images?|gallery|urls?|imageList)"\s*:\s*(\[[^\]]{10,}\])/i,
    /data-(?:images?|pages?|gallery)\s*=\s*["'](\[[^\]]+\])["']/i,
  ];
  for (const re of jsonVarPatterns) {
    const m = html.match(re);
    if (m) {
      try {
        const raw = m[1].startsWith("[") ? m[1] : `[${m[1]}]`;
        const parsed = JSON.parse(raw.replace(/'/g, '"'));
        if (Array.isArray(parsed)) {
          const urls = (parsed as string[])
            .filter((u) => typeof u === "string" && /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(u))
            .map(toFullRes);
          if (urls.length > 0) return { urls, strategy: "A-json-var" };
        }
      } catch { /* next */ }
      const quoted = m[1].match(/"(https?:\/\/[^"]+\.(?:jpg|jpeg|png|webp|gif)[^"]*)"/gi);
      if (quoted?.length) {
        const urls = quoted.map((q) => toFullRes(q.replace(/"/g, "").trim()));
        if (urls.length > 0) return { urls, strategy: "A-json-quoted" };
      }
    }
  }

  // ── Strategy B: __NEXT_DATA__ / __NUXT__ ─────────────────────────────────
  for (const scriptRe of [
    /<script[^>]+id=["']__NEXT_DATA__["'][^>]*>([\s\S]*?)<\/script>/i,
    /window\.__(?:NUXT|INITIAL_STATE|STATE)__\s*=\s*(\{[\s\S]{20,}?\});?\s*\n/i,
  ]) {
    const sm = html.match(scriptRe);
    if (sm) {
      try {
        const data = JSON.parse(sm[1]);
        const allUrls: string[] = [];
        const walk = (obj: unknown) => {
          if (typeof obj === "string" && /^https?:\/\/.+\.(jpg|jpeg|png|webp|gif)/i.test(obj)) {
            allUrls.push(toFullRes(obj));
          } else if (Array.isArray(obj)) obj.forEach(walk);
          else if (obj && typeof obj === "object") Object.values(obj).forEach(walk);
        };
        walk(data);
        const filtered = [...new Set(allUrls)].filter(isFullResUrl);
        if (filtered.length > 0) return { urls: filtered, strategy: "B-next-data" };
      } catch { /* next */ }
    }
  }

  // ── Strategy C: ALL img tags — collect everything, strip thumbs after ─────
  //
  // KEY FIX: we now collect BOTH thumbnail (-t.jpg) and non-thumbnail URLs,
  // convert ALL of them to full-res, then deduplicate by the full-res URL.
  // This prevents the case where some pages are thumbnail-only in the HTML
  // (i.e. the -t version is the only src listed) from being missed.
  //
  // We use a Map keyed by the full-res URL so deduplication is correct AFTER
  // the -t strip (not before), which was causing pages to disappear.

  const pageMap = new Map<string, string>(); // full-res-url → full-res-url

  // Match any img attribute that could hold a URL — broad on purpose
  const imgTagRe = /<img\b[^>]+>/gi;
  const attrRe   = /(?:src|data-src|data-lazy(?:-src)?|data-original|data-url)\s*=\s*["']([^"']+)["']/gi;

  let imgTag: RegExpExecArray | null;
  while ((imgTag = imgTagRe.exec(html)) !== null) {
    const tag = imgTag[0];
    let attr: RegExpExecArray | null;
    while ((attr = attrRe.exec(tag)) !== null) {
      const raw = attr[1];
      if (!/\.(jpg|jpeg|png|webp|gif)/i.test(raw)) continue;
      if (!raw.startsWith("http"))                  continue;

      const full = toFullRes(raw);

      // Only keep URLs that look like gallery content pages
      if (!isFullResUrl(full)) continue;

      // Skip obvious UI assets
      if (/\/(logo|avatar|icon|banner|sprite|favicon|placeholder)\b/i.test(full)) continue;

      // ── Key fix: hentaicity page images always have a 32-char MD5 hash
      // as the filename (e.g. 4d34b03f954665fd913cf0994103d8d4.jpg).
      // Cover images and "next gallery" previews use different filename
      // patterns and get filtered out here.
      const filename = full.split("/").pop()?.split("?")[0] ?? "";
      const nameWithoutExt = filename.replace(/\.[^.]+$/, "");
      if (!/^[a-f0-9]{32}$/i.test(nameWithoutExt)) continue;

      pageMap.set(full, full);
    }
    attrRe.lastIndex = 0; // reset inner regex for each tag
  }

  if (pageMap.size > 0) {
    const urls = Array.from(pageMap.values());
    console.log(`[HentaiCity] strategy C collected ${urls ?? urls} unique full-res URLs`);
    return { urls, strategy: "C-img-tags" };
  }

  // ── Strategy D: bare URL scan anywhere in page ────────────────────────────
  const allUrlRe = /["'](https?:\/\/[^"']+\.(?:jpg|jpeg|png|webp))['"]/gi;
  const dMap = new Map<string, string>();
  let am: RegExpExecArray | null;
  while ((am = allUrlRe.exec(html)) !== null) {
    const full = toFullRes(am[1]);
    if (!isFullResUrl(full)) continue;
    if (/\/(logo|avatar|icon|banner|sprite|favicon)\b/i.test(full)) continue;
    dMap.set(full, full);
  }
  if (dMap.size > 0) {
    return { urls: Array.from(dMap.values()), strategy: "D-all-urls" };
  }

  return { urls: [], strategy: "none" };
}

// ─── Diagnostic ───────────────────────────────────────────────────────────────

function diagnose(html: string): void {
  console.log("\n════════ HENTAICITY DIAGNOSTIC ════════");
  console.log(`HTML length: ${html.length}`);

  const scripts = [...html.matchAll(/<script([^>]*)>([\s\S]{0,400})/gi)];
  console.log(`\n▸ ${scripts.length} <script> tags:`);
  scripts.slice(0, 6).forEach((s, i) =>
    console.log(`  [${i}] ${s[1].trim()} → ${s[2].slice(0, 200).replace(/\s+/g, " ")}`)
  );

  const imgs = [...html.matchAll(/<img[^>]+(?:src|data-src)=["']([^"']+)["']/gi)];
  console.log(`\n▸ ${imgs.length} img tags (first 15):`);
  imgs.slice(0, 15).forEach((m, i) => console.log(`  [${i}] ${m[1]}`));

  const metas = [...html.matchAll(/<meta[^>]+(?:og:|twitter:)[^>]+>/gi)];
  console.log(`\n▸ ${metas.length} og/twitter metas:`);
  metas.forEach((m, i) => console.log(`  [${i}] ${m[0]}`));

  console.log("════════ END DIAGNOSTIC ════════\n");
}

// ─── Main export ──────────────────────────────────────────────────────────────

export const scrapeHentaiCity = async (url: string): Promise<MangaMeta> => {
  if (!HENTAICITY_PATTERN.test(url)) {
    throw new Error(
      "Invalid HentaiCity URL.\nExpected: https://www.hentaicity.com/gallery/[slug].html"
    );
  }

  let html: string;
  try {
    const res = await fetch(url, { headers: HEADERS });
    if (res.status === 403) {
      throw new Error(
        "HentaiCity 403 — Cloudflare is blocking this request.\n" +
          "Open the page in a browser once to get a CF cookie, then retry."
      );
    }
    if (!res.ok) throw new Error(`HentaiCity HTTP ${res.status}`);
    html = await res.text();
  } catch (err: any) {
    if (err.message.startsWith("HentaiCity")) throw err;
    throw new Error(`Network error: ${err.message}`);
  }

  if (DIAGNOSTIC) diagnose(html);

  const { urls: imageUrls, strategy } = getImageUrls(html);

  if (imageUrls.length === 0) {
    diagnose(html);
    throw new Error(
      "HentaiCity: could not find image URLs.\n" +
        "Check console for diagnostic output."
    );
  }

  console.log(`[HentaiCity] strategy=${strategy} images=${imageUrls.length}`);
  console.log(`[HentaiCity] first: ${imageUrls[0]}`);
  console.log(`[HentaiCity] last:  ${imageUrls[imageUrls.length - 1]}`);

  const rawTitle = getTitle(html);
  const slug     = url.match(/\/gallery\/(.+)\.html/i)?.[1] ?? "";
  const name = rawTitle
    .replace(/\s*[|—–]\s*(?:hentai\s*city|read\s*online|hentaicity).*/i, "")
    .trim() ||
    slug.replace(/-[a-z0-9]{8,}$/i, "").replace(/-/g, " ").trim();

  return {
    name,
    author:    getAuthor(html),
    tags:      getTags(html),
    genres:    [],
    ep:        getEpisode(url, html),
    source:    "hentaicity",
    imageUrls,
  };
};