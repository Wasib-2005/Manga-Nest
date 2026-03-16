import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View, Text, TextInput, TouchableOpacity,
  FlatList, Image, ScrollView, ActivityIndicator, Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  readMangaLibrary, searchByTitle, filterByGenre,
  getFirstPageUri, type MangaEntry,
} from "../../../services/reader/libraryService";
import { getHiddenMangaList } from "../../../services/reader/readingProgressService";
import { ChapterPickerModal } from "./chapterPickerModal";

// ─── Sort ─────────────────────────────────────────────────────────────────────

type SortKey =
  | "newest" | "oldest"
  | "az"     | "za"
  | "most-pages" | "least-pages"
  | "most-chapters" | "least-chapters";

const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
  { key: "newest",         label: "Newest first",     icon: "clock-outline"                  },
  { key: "oldest",         label: "Oldest first",     icon: "history"                        },
  { key: "az",             label: "A → Z",            icon: "sort-alphabetical-ascending"    },
  { key: "za",             label: "Z → A",            icon: "sort-alphabetical-descending"   },
  { key: "most-pages",     label: "Most pages",       icon: "file-multiple-outline"          },
  { key: "least-pages",    label: "Least pages",      icon: "file-outline"                   },
  { key: "most-chapters",  label: "Most episodes",    icon: "book-multiple-outline"          },
  { key: "least-chapters", label: "Fewest episodes",  icon: "book-outline"                   },
];

function sortManga(list: MangaEntry[], key: SortKey): MangaEntry[] {
  const copy = [...list];
  const totalPages = (m: MangaEntry) => m.chapters.reduce((s, c) => s + c.pages, 0);
  switch (key) {
    case "az":             return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "za":             return copy.sort((a, b) => b.name.localeCompare(a.name));
    case "newest":         return copy.sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt));
    case "oldest":         return copy.sort((a, b) => +new Date(a.addedAt) - +new Date(b.addedAt));
    case "most-pages":     return copy.sort((a, b) => totalPages(b) - totalPages(a));
    case "least-pages":    return copy.sort((a, b) => totalPages(a) - totalPages(b));
    case "most-chapters":  return copy.sort((a, b) => b.chapters.length - a.chapters.length);
    case "least-chapters": return copy.sort((a, b) => a.chapters.length - b.chapters.length);
  }
}

// ─── Source config ────────────────────────────────────────────────────────────

const SRC_LABEL: Record<string, string> = { nhentai: "nH", mangadex: "MD", sequential: "SQ" };
const SRC_COLOR: Record<string, string> = { nhentai: "#f97316", mangadex: "#3b82f6", sequential: "#a855f7" };

// ─── Cover image (lazy, one per card) ────────────────────────────────────────

const CoverImage = React.memo(function CoverImage(
  { uid, firstEp }: { uid: string; firstEp: string }
) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { getFirstPageUri(uid, firstEp).then(setUri); }, [uid, firstEp]);

  return (
    <View style={{ width: 72, height: 100, borderRadius: 8,
      overflow: "hidden", backgroundColor: "#0f172a" }}>
      {uri ? (
        <Image source={{ uri: `file://${uri}` }}
          style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <MaterialCommunityIcons name="image-outline" size={22} color="#334155" />
        </View>
      )}
    </View>
  );
});

// ─── Manga card ───────────────────────────────────────────────────────────────

const MangaCard = React.memo(function MangaCard(
  { item, onPress }: { item: MangaEntry; onPress: () => void }
) {
  const totalPages = item.chapters.reduce((s, c) => s + c.pages, 0);
  const firstEp    = item.chapters[0]?.ep ?? "";
  const srcColor   = SRC_COLOR[item.source] ?? "#64748b";
  const srcLabel   = SRC_LABEL[item.source] ?? "?";
  const addedDate  = new Date(item.addedAt).toLocaleDateString("en-US",
    { month: "short", day: "numeric", year: "numeric" });

  return (
    <TouchableOpacity
      onPress={onPress}
      onLongPress={() => Alert.alert(item.name)}
      activeOpacity={0.75}
      style={{ flexDirection: "row", gap: 12,
        backgroundColor: "#0a0e17",
        borderRadius: 12, padding: 12, marginBottom: 10,
        borderWidth: 1, borderColor: "#141c2b" }}
    >
      {/* Cover */}
      {firstEp
        ? <CoverImage uid={item.uid} firstEp={firstEp} />
        : <View style={{ width: 72, height: 100, borderRadius: 8, backgroundColor: "#0f172a",
            justifyContent: "center", alignItems: "center" }}>
            <MaterialCommunityIcons name="book-outline" size={26} color="#334155" />
          </View>
      }

      {/* Text */}
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        {/* Title + source */}
        <View style={{ flexDirection: "row", alignItems: "flex-start",
          justifyContent: "space-between", gap: 6 }}>
          <Text style={{ color: "#f1f5f9", fontWeight: "700", fontSize: 14,
            flex: 1, lineHeight: 20 }} numberOfLines={2}>
            {item.name}
          </Text>
          <View style={{ backgroundColor: srcColor + "20", borderRadius: 6,
            paddingHorizontal: 6, paddingVertical: 2,
            borderWidth: 1, borderColor: srcColor + "44" }}>
            <Text style={{ color: srcColor, fontSize: 10, fontWeight: "700" }}>
              {srcLabel}
            </Text>
          </View>
        </View>

        {/* Author */}
        {!!item.author && (
          <Text style={{ color: "#475569", fontSize: 11, marginTop: 2 }} numberOfLines={1}>
            {item.author}
          </Text>
        )}

        {/* Stats row */}
        <View style={{ flexDirection: "row", gap: 10, marginTop: 5, flexWrap: "wrap" }}>
          {[
            { icon: "book-open-variant",       text: `Eps: ${item.chapters.length}` },
            { icon: "file-document-outline",   text: `Pages: ${totalPages}`         },
            { icon: "calendar-outline",        text: addedDate                       },
          ].map((s, i) => (
            <View key={i} style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
              <MaterialCommunityIcons name={s.icon as any} size={11} color="#334155" />
              <Text style={{ color: "#64748b", fontSize: 11 }}>{s.text}</Text>
            </View>
          ))}
        </View>

        {/* Tags */}
        {item.tags.length > 0 && (
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            style={{ marginTop: 6 }}>
            {item.tags.slice(0, 6).map((tag, i) => (
              <View key={i} style={{ backgroundColor: "#141c2b", borderRadius: 4,
                paddingHorizontal: 6, paddingVertical: 2, marginRight: 4 }}>
                <Text style={{ color: "#475569", fontSize: 10 }}>{tag}</Text>
              </View>
            ))}
            {item.tags.length > 6 && (
              <View style={{ backgroundColor: "#141c2b", borderRadius: 4,
                paddingHorizontal: 6, paddingVertical: 2 }}>
                <Text style={{ color: "#334155", fontSize: 10 }}>
                  +{item.tags.length - 6}
                </Text>
              </View>
            )}
          </ScrollView>
        )}
      </View>
    </TouchableOpacity>
  );
});

// ─── Filter chip ──────────────────────────────────────────────────────────────

const Chip = React.memo(function Chip(
  { label, active, onPress, color }:
  { label: string; active: boolean; onPress: () => void; color?: string }
) {
  const c = color ?? "#38D926";
  return (
    <TouchableOpacity onPress={onPress} style={{
      paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, marginRight: 6,
      backgroundColor: active ? c + "20" : "#0a0e17",
      borderWidth: 1, borderColor: active ? c : "#141c2b",
    }}>
      <Text style={{ color: active ? c : "#475569", fontSize: 12, fontWeight: "600" }}>
        {label}
      </Text>
    </TouchableOpacity>
  );
});

// ─── LibraryScreen ────────────────────────────────────────────────────────────

interface Props {
  onSelectManga: (manga: MangaEntry, chapter: string) => void;
  hideMode:      boolean;
}

export const LibraryScreen = ({ onSelectManga, hideMode }: Props) => {
  const [manga,       setManga]       = useState<MangaEntry[]>([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState("");
  const [sortKey,     setSortKey]     = useState<SortKey>("newest");
  const [genre,       setGenre]       = useState("");
  const [tag,         setTag]         = useState("");
  const [source,      setSource]      = useState("");
  const [allGenres,   setAllGenres]   = useState<string[]>([]);
  const [allTags,     setAllTags]     = useState<string[]>([]);
  const [hiddenList,  setHiddenList]  = useState<string[]>([]);
  const [showSort,    setShowSort]    = useState(false);
  const [showTags,    setShowTags]    = useState(false);
  const [pickerManga, setPickerManga] = useState<MangaEntry | null>(null);
  const [pickerOpen,  setPickerOpen]  = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [library, hidden] = await Promise.all([readMangaLibrary(), getHiddenMangaList()]);
      setHiddenList(hidden);

      const genreSet = new Set<string>();
      const tagSet   = new Set<string>();
      library.forEach(m => {
        m.genres.forEach(g => genreSet.add(g));
        m.tags  .forEach(t => tagSet  .add(t));
      });
      setAllGenres(Array.from(genreSet).sort());
      setAllTags  (Array.from(tagSet)  .sort());
      setManga(library);
      setLoading(false);
    })();
  }, []);

  // ── Filtered + sorted list (memoised for performance) ────────────────────
  const filtered = useMemo(() => {
    let result = hideMode
      ? manga.filter(m =>  hiddenList.includes(m.uid))
      : manga.filter(m => !hiddenList.includes(m.uid));

    result = searchByTitle(result, search);
    result = filterByGenre(result, genre);
    if (tag)    result = result.filter(m => m.tags.some(t => t.toLowerCase().includes(tag.toLowerCase())));
    if (source) result = result.filter(m => m.source === source);
    return sortManga(result, sortKey);
  }, [manga, search, genre, tag, source, sortKey, hiddenList, hideMode]);

  const handleTap = useCallback((item: MangaEntry) => {
    if (item.chapters.length === 1) {
      onSelectManga(item, item.chapters[0].ep);
    } else {
      setPickerManga(item);
      setPickerOpen(true);
    }
  }, [onSelectManga]);

  const renderItem = useCallback(({ item }: { item: MangaEntry }) => (
    <MangaCard item={item} onPress={() => handleTap(item)} />
  ), [handleTap]);

  const keyExtractor = useCallback((item: MangaEntry) => item.uid, []);

  const currentSortLabel = SORT_OPTIONS.find(s => s.key === sortKey)?.label ?? "Sort";

  // ─────────────────────────────────────────────────────────────────────────

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#030712",
        justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#38D926" />
        <Text style={{ color: "#334155", marginTop: 12, fontSize: 13 }}>Loading library…</Text>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#030712" }}>

      {/* ── Header ────────────────────────────────────────────────────────── */}
      <View style={{ paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10,
        backgroundColor: "#030712", borderBottomWidth: 1, borderBottomColor: "#0a0e17" }}>

        {/* Title */}
        <View style={{ flexDirection: "row", alignItems: "baseline",
          justifyContent: "space-between", marginBottom: 10 }}>
          <Text style={{ color: "#f1f5f9", fontSize: 22, fontWeight: "900" }}>
            Manga <Text style={{ color: "#38D926" }}>Nest</Text>
          </Text>
          <Text style={{ color: "#334155", fontSize: 12 }}>
            {hideMode ? "🔒 Hidden" : `${filtered.length} titles`}
          </Text>
        </View>

        {/* Search */}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8,
          backgroundColor: "#0a0e17", borderRadius: 10, paddingHorizontal: 10,
          paddingVertical: 8, borderWidth: 1, borderColor: "#141c2b", marginBottom: 10 }}>
          <MaterialCommunityIcons name="magnify" size={17} color="#334155" />
          <TextInput
            value={search} onChangeText={setSearch}
            placeholder="Search title…" placeholderTextColor="#334155"
            style={{ flex: 1, color: "#f1f5f9", fontSize: 13 }}
          />
          {search !== "" && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <MaterialCommunityIcons name="close-circle" size={15} color="#334155" />
            </TouchableOpacity>
          )}
        </View>

        {/* Sort + source row */}
        {!hideMode && (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            {/* Sort toggle */}
            <TouchableOpacity onPress={() => { setShowSort(v => !v); setShowTags(false); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4,
                backgroundColor: "#0a0e17", borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 6,
                borderWidth: 1, borderColor: showSort ? "#38D926" : "#141c2b" }}>
              <MaterialCommunityIcons name="sort" size={14}
                color={showSort ? "#38D926" : "#475569"} />
              <Text style={{ color: showSort ? "#38D926" : "#475569",
                fontSize: 12, fontWeight: "600" }}>{currentSortLabel}</Text>
            </TouchableOpacity>

            {/* Tag filter toggle */}
            <TouchableOpacity onPress={() => { setShowTags(v => !v); setShowSort(false); }}
              style={{ flexDirection: "row", alignItems: "center", gap: 4,
                backgroundColor: "#0a0e17", borderRadius: 8,
                paddingHorizontal: 10, paddingVertical: 6,
                borderWidth: 1, borderColor: (showTags || tag) ? "#38D926" : "#141c2b" }}>
              <MaterialCommunityIcons name="tag-outline" size={14}
                color={(showTags || tag) ? "#38D926" : "#475569"} />
              <Text style={{ color: (showTags || tag) ? "#38D926" : "#475569",
                fontSize: 12, fontWeight: "600" }}>
                {tag || "Tags"}
              </Text>
              {tag !== "" && (
                <TouchableOpacity onPress={() => setTag("")} hitSlop={{ top: 6, right: 6, bottom: 6, left: 6 }}>
                  <MaterialCommunityIcons name="close-circle" size={13} color="#38D926" />
                </TouchableOpacity>
              )}
            </TouchableOpacity>

            {/* Source chips */}
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ flex: 1 }}>
              {(["nhentai", "mangadex", "sequential"] as const).map(src => {
                const hasAny = manga.some(m => m.source === src && !hiddenList.includes(m.uid));
                if (!hasAny) return null;
                return (
                  <Chip key={src} label={SRC_LABEL[src]}
                    active={source === src}
                    onPress={() => setSource(s => s === src ? "" : src)}
                    color={SRC_COLOR[src]}
                  />
                );
              })}
            </ScrollView>
          </View>
        )}

        {/* Sort dropdown */}
        {showSort && !hideMode && (
          <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginTop: 8 }}>
            {SORT_OPTIONS.map(opt => (
              <TouchableOpacity key={opt.key}
                onPress={() => { setSortKey(opt.key); setShowSort(false); }}
                style={{ flexDirection: "row", alignItems: "center", gap: 4,
                  paddingHorizontal: 10, paddingVertical: 5, borderRadius: 8,
                  backgroundColor: sortKey === opt.key ? "#38D92618" : "#0a0e17",
                  borderWidth: 1, borderColor: sortKey === opt.key ? "#38D926" : "#141c2b" }}>
                <MaterialCommunityIcons name={opt.icon as any} size={13}
                  color={sortKey === opt.key ? "#38D926" : "#334155"} />
                <Text style={{ color: sortKey === opt.key ? "#38D926" : "#475569",
                  fontSize: 12, fontWeight: "600" }}>{opt.label}</Text>
              </TouchableOpacity>
            ))}
          </View>
        )}
      </View>

      {/* ── Genre chips ────────────────────────────────────────────────────── */}
      {!hideMode && allGenres.length > 0 && (
        <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#0a0e17" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}>
            <Chip label="All" active={genre === ""} onPress={() => setGenre("")} />
            {allGenres.map(g => (
              <Chip key={g} label={g} active={genre === g}
                onPress={() => setGenre(v => v === g ? "" : g)} />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── Tag chips (expandable) ─────────────────────────────────────────── */}
      {!hideMode && showTags && allTags.length > 0 && (
        <View style={{ paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: "#0a0e17",
          backgroundColor: "#030712" }}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}
            contentContainerStyle={{ paddingHorizontal: 16 }}>
            <Chip label="All tags" active={tag === ""} onPress={() => setTag("")} />
            {allTags.map(t => (
              <Chip key={t} label={t} active={tag === t}
                onPress={() => setTag(v => v === t ? "" : t)}
                color="#a855f7"
              />
            ))}
          </ScrollView>
        </View>
      )}

      {/* ── List ──────────────────────────────────────────────────────────── */}
      {filtered.length === 0 ? (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <MaterialCommunityIcons name={hideMode ? "lock" : "inbox"}
            size={44} color="#141c2b" />
          <Text style={{ color: "#334155", marginTop: 10, fontSize: 13 }}>
            {hideMode ? "No hidden manga" : "Nothing found"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={keyExtractor}
          renderItem={renderItem}
          contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          removeClippedSubviews
          windowSize={7}
          maxToRenderPerBatch={5}
          initialNumToRender={8}
          updateCellsBatchingPeriod={50}
          getItemLayout={(_, index) => ({ length: 124, offset: 124 * index, index })}
        />
      )}

      {pickerManga && (
        <ChapterPickerModal
          visible={pickerOpen}
          chapters={pickerManga.chapters}
          mangaName={pickerManga.name}
          onSelectChapter={ep => { onSelectManga(pickerManga, ep); setPickerOpen(false); }}
          onClose={() => { setPickerOpen(false); setPickerManga(null); }}
        />
      )}
    </View>
  );
};