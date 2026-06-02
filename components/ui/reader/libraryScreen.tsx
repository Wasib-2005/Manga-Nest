import React, { useState, useEffect, useCallback, useMemo } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  FlatList,
  Image,
  ScrollView,
  ActivityIndicator,
  Alert,
  Dimensions,
  RefreshControl,
  Modal,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  readMangaLibrary,
  searchByTitle,
  getFirstPageUri,
  updateMangaMetadata,
  type MangaEntry,
  type ChapterInfo,
} from "../../../services/reader/libraryService";
import { getHiddenMangaList } from "../../../services/reader/readingProgressService";
import { ChapterPickerModal } from "./chapterPickerModal";
import { EditMangaModal } from "./editMangaModal";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest" | "az" | "za" | "most-eps" | "least-eps" | "source";
type LayoutMode = "hero" | "list" | "grid" | "compact";

interface ActiveFilters {
  tags: string[];
  genres: string[];
  sources: string[];
}

interface FlatItem {
  manga: MangaEntry;
  chapter: ChapterInfo;
}

// ─── Constants ────────────────────────────────────────────────────────────────

// Each entry is a pair [primary, inverse]. Tapping the active key flips to its partner.
const SORT_PAIRS: {
  primary: SortKey; primaryLabel: string; primaryIcon: string;
  inverse: SortKey; inverseLabel: string; inverseIcon: string;
}[] = [
  {
    primary: "newest",    primaryLabel: "Newest",    primaryIcon: "clock-outline",
    inverse: "oldest",    inverseLabel: "Oldest",    inverseIcon: "clock-check-outline",
  },
  {
    primary: "az",        primaryLabel: "A → Z",     primaryIcon: "sort-alphabetical-ascending",
    inverse: "za",        inverseLabel: "Z → A",     inverseIcon: "sort-alphabetical-descending",
  },
  {
    primary: "most-eps",  primaryLabel: "Most Eps",  primaryIcon: "library-shelves",
    inverse: "least-eps", inverseLabel: "Least Eps", inverseIcon: "library-outline",
  },
  {
    primary: "source",    primaryLabel: "Source",    primaryIcon: "database-outline",
    inverse: "source",    inverseLabel: "Source",    inverseIcon: "database-outline",
  },
];

const SRC_LABEL: Record<string, string> = { nhentai: "nH", mangadex: "MD", sequential: "SQ" };
const SRC_COLOR: Record<string, string> = {
  nhentai: "#f97316",
  mangadex: "#3b82f6",
  sequential: "#a855f7",
};
const EMPTY_FILTERS: ActiveFilters = { tags: [], genres: [], sources: [] };

// ─── Helpers ──────────────────────────────────────────────────────────────────

function sortManga(list: MangaEntry[], key: SortKey): MangaEntry[] {
  const copy = [...list];
  switch (key) {
    case "az":        return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "za":        return copy.sort((a, b) => b.name.localeCompare(a.name));
    case "newest":    return copy.sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt));
    case "oldest":    return copy.sort((a, b) => +new Date(a.addedAt) - +new Date(b.addedAt));
    case "most-eps":  return copy.sort((a, b) => b.chapters.length - a.chapters.length);
    case "least-eps": return copy.sort((a, b) => a.chapters.length - b.chapters.length);
    case "source":    return copy.sort((a, b) => a.source.localeCompare(b.source));
    default:          return copy;
  }
}

function applyFilters(list: MangaEntry[], filters: ActiveFilters): MangaEntry[] {
  return list.filter((m) => {
    if (filters.sources.length > 0 && !filters.sources.includes(m.source)) return false;
    if (filters.tags.length > 0 && !filters.tags.some((t) => m.tags.includes(t))) return false;
    if (filters.genres.length > 0 && !filters.genres.some((g) => m.genres.includes(g))) return false;
    return true;
  });
}

// ─── Image Sub-Components ─────────────────────────────────────────────────────

const AutoHeightImage = React.memo(({ uri }: { uri: string }) => {
  const [aspectRatio, setAspectRatio] = useState(3 / 4);
  useEffect(() => {
    let mounted = true;
    Image.getSize(`file://${uri}`, (w, h) => {
      if (mounted && w && h) setAspectRatio(w / h);
    }, () => {});
    return () => { mounted = false; };
  }, [uri]);
  return (
    <Image
      source={{ uri: `file://${uri}` }}
      style={{ width: "100%", aspectRatio, maxHeight: SCREEN_HEIGHT * 0.6, borderRadius: 12, backgroundColor: "#0f172a" }}
      resizeMode="cover"
    />
  );
});
AutoHeightImage.displayName = "AutoHeightImage";

const CoverImage = React.memo(({
  uid, firstEp, autoHeight, height = 120,
}: { uid: string; firstEp: string; autoHeight?: boolean; height?: number }) => {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    let mounted = true;
    getFirstPageUri(uid, firstEp).then((r) => { if (mounted) setUri(r); });
    return () => { mounted = false; };
  }, [uid, firstEp]);

  if (!uri)
    return (
      <View style={{ width: "100%", height, borderRadius: 8, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
        <MaterialCommunityIcons name="image-off-outline" size={20} color="#1e293b" />
      </View>
    );
  return autoHeight ? <AutoHeightImage uri={uri} /> : (
    <Image source={{ uri: `file://${uri}` }} style={{ width: "100%", height, borderRadius: 8 }} resizeMode="cover" />
  );
});
CoverImage.displayName = "CoverImage";

// ─── AdaptiveCard ─────────────────────────────────────────────────────────────

const AdaptiveCard = React.memo(({ item, mode }: { item: MangaEntry; mode: LayoutMode }) => {
  const firstEp = item.chapters[0]?.ep ?? "";
  const srcColor = SRC_COLOR[item.source] ?? "#64748b";
  const isCompact = mode === "compact";

  if (mode === "hero") {
    return (
      <View style={{ marginBottom: 32, paddingHorizontal: 16 }}>
        <CoverImage uid={item.uid} firstEp={firstEp} autoHeight />
        <View style={{ marginTop: 14 }}>
          <Text style={{ color: srcColor, fontWeight: "900", fontSize: 12 }}>{item.source.toUpperCase()}</Text>
          <Text style={{ color: "#f1f5f9", fontWeight: "900", fontSize: 22, marginTop: 4 }}>{item.name}</Text>
          {item.tags.length > 0 && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 8 }}>
              {item.tags.slice(0, 5).map((t) => (
                <View key={t} style={styles.chip}><Text style={styles.chipText}>{t}</Text></View>
              ))}
            </ScrollView>
          )}
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: 10, backgroundColor: "#0a0e17", padding: 10, borderRadius: 8 }}>
            <MaterialCommunityIcons name="library-shelves" size={18} color="#38D926" />
            <Text style={{ color: "#f1f5f9", marginLeft: 8, fontWeight: "600" }}>{item.chapters.length} Chapters stored</Text>
          </View>
        </View>
      </View>
    );
  }

  if (mode === "list") {
    return (
      <View style={{ flexDirection: "row", gap: 14, backgroundColor: "#0a0e17", borderRadius: 16, padding: 12, marginBottom: 12, marginHorizontal: 16, borderWidth: 1, borderColor: "#141c2b" }}>
        <View style={{ width: 80, height: 110 }}><CoverImage uid={item.uid} firstEp={firstEp} height={110} /></View>
        <View style={{ flex: 1, justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: srcColor, fontSize: 10, fontWeight: "900" }}>{SRC_LABEL[item.source]}</Text>
            <Text style={{ color: "#f1f5f9", fontWeight: "700", fontSize: 15 }} numberOfLines={2}>{item.name}</Text>
            {item.genres.length > 0 && (
              <Text style={{ color: "#475569", fontSize: 10, marginTop: 3 }} numberOfLines={1}>
                {item.genres.slice(0, 3).join(" · ")}
              </Text>
            )}
          </View>
          <Text style={{ color: "#38D926", fontSize: 12, fontWeight: "800" }}>{item.chapters.length} Eps</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 16 }}>
      <CoverImage uid={item.uid} firstEp={firstEp} height={isCompact ? 130 : 180} />
      <View style={{ marginTop: 6, paddingHorizontal: 2 }}>
        <Text style={{ color: "#f1f5f9", fontWeight: "600", fontSize: isCompact ? 10 : 12 }} numberOfLines={1}>{item.name}</Text>
        <Text style={{ color: "#38D926", fontSize: 9, fontWeight: "700" }}>{item.chapters.length} Eps</Text>
      </View>
    </View>
  );
});
AdaptiveCard.displayName = "AdaptiveCard";

// ─── FlatCard ─────────────────────────────────────────────────────────────────

const FlatCard = React.memo(({ item, mode }: { item: FlatItem; mode: LayoutMode }) => {
  const { manga, chapter } = item;
  const srcColor = SRC_COLOR[manga.source] ?? "#64748b";
  const isCompact = mode === "compact";

  if (mode === "list") {
    return (
      <View style={{ flexDirection: "row", gap: 14, backgroundColor: "#0a0e17", borderRadius: 16, padding: 12, marginBottom: 12, marginHorizontal: 16, borderWidth: 1, borderColor: "#141c2b" }}>
        <View style={{ width: 80, height: 110 }}><CoverImage uid={manga.uid} firstEp={chapter.ep} height={110} /></View>
        <View style={{ flex: 1, justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: srcColor, fontSize: 10, fontWeight: "900" }}>{SRC_LABEL[manga.source]}</Text>
            <Text style={{ color: "#f1f5f9", fontWeight: "700", fontSize: 14 }} numberOfLines={2}>{manga.name}</Text>
            <Text style={{ color: "#38D926", fontSize: 12, marginTop: 4, fontWeight: "800" }}>EP {chapter.ep}</Text>
          </View>
          <Text style={{ color: "#475569", fontSize: 10 }}>{chapter.pages} pages</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={{ marginBottom: 16 }}>
      <CoverImage uid={manga.uid} firstEp={chapter.ep} height={isCompact ? 130 : 180} />
      <View style={{ marginTop: 6, paddingHorizontal: 2 }}>
        <Text style={{ color: "#f1f5f9", fontWeight: "600", fontSize: isCompact ? 10 : 12 }} numberOfLines={1}>{manga.name}</Text>
        <Text style={{ color: "#38D926", fontSize: 9, fontWeight: "700" }}>EP {chapter.ep}</Text>
      </View>
    </View>
  );
});
FlatCard.displayName = "FlatCard";

// ─── Filter Modal ─────────────────────────────────────────────────────────────

interface FilterModalProps {
  visible: boolean;
  onClose: () => void;
  allTags: string[];
  allGenres: string[];
  allSources: string[];
  filters: ActiveFilters;
  onChange: (f: ActiveFilters) => void;
  flatMode: boolean;
  onToggleFlatMode: () => void;
}

const FilterModal = ({
  visible, onClose, allTags, allGenres, allSources,
  filters, onChange, flatMode, onToggleFlatMode,
}: FilterModalProps) => {
  const [local, setLocal] = useState<ActiveFilters>(filters);
  useEffect(() => { if (visible) setLocal(filters); }, [visible]);

  const toggle = (key: keyof ActiveFilters, value: string) =>
    setLocal((prev) => ({
      ...prev,
      [key]: prev[key].includes(value)
        ? prev[key].filter((v) => v !== value)
        : [...prev[key], value],
    }));

  const activeCount = local.tags.length + local.genres.length + local.sources.length;

  const Section = ({ title, items, filterKey }: {
    title: string; items: string[]; filterKey: keyof ActiveFilters;
  }) => {
    if (items.length === 0) return null;
    return (
      <View style={{ marginBottom: 24 }}>
        <Text style={styles.filterSectionLabel}>{title}</Text>
        <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
          {items.map((item) => {
            const active = local[filterKey].includes(item);
            return (
              <TouchableOpacity
                key={item}
                onPress={() => toggle(filterKey, item)}
                style={[styles.filterChip, active && styles.filterChipActive]}
              >
                <Text style={[styles.filterChipText, active && styles.filterChipTextActive]}>{item}</Text>
              </TouchableOpacity>
            );
          })}
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />
      <View style={styles.filterSheet}>
        <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 4 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#1e293b" }} />
        </View>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: "#0f172a" }}>
          <Text style={{ color: "#f1f5f9", fontSize: 16, fontWeight: "700" }}>
            Filter & View{activeCount > 0 && <Text style={{ color: "#38D926" }}> ({activeCount})</Text>}
          </Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={20} color="#475569" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 44 }}>
          <View style={{ marginBottom: 24 }}>
            <Text style={styles.filterSectionLabel}>View Mode</Text>
            <TouchableOpacity onPress={onToggleFlatMode} style={[styles.flatToggle, flatMode && styles.flatToggleActive]}>
              <MaterialCommunityIcons name="format-list-bulleted-square" size={20} color={flatMode ? "#38D926" : "#475569"} />
              <View style={{ flex: 1, marginLeft: 12 }}>
                <Text style={{ color: flatMode ? "#38D926" : "#f1f5f9", fontWeight: "700", fontSize: 14 }}>Single Episode View</Text>
                <Text style={{ color: "#475569", fontSize: 11, marginTop: 2 }}>Show every chapter as its own card</Text>
              </View>
              <View style={[styles.toggleDot, flatMode && styles.toggleDotActive]} />
            </TouchableOpacity>
          </View>

          <Section title="Source" items={allSources} filterKey="sources" />
          <Section title="Genres" items={allGenres} filterKey="genres" />
          <Section title="Tags"   items={allTags}   filterKey="tags" />
        </ScrollView>

        <View style={{ flexDirection: "row", gap: 10, paddingHorizontal: 20, paddingBottom: 32, paddingTop: 12, borderTopWidth: 1, borderTopColor: "#0f172a" }}>
          <TouchableOpacity onPress={() => { setLocal(EMPTY_FILTERS); onChange(EMPTY_FILTERS); }} style={styles.clearBtn}>
            <Text style={{ color: "#475569", fontWeight: "700" }}>Clear All</Text>
          </TouchableOpacity>
          <TouchableOpacity onPress={() => { onChange(local); onClose(); }} style={styles.applyBtn}>
            <Text style={{ color: "#030712", fontWeight: "900" }}>Apply Filters</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
};

// ─── Active Filter Chips ──────────────────────────────────────────────────────

const ActiveFilterChips = ({
  filters, onRemove,
}: { filters: ActiveFilters; onRemove: (key: keyof ActiveFilters, value: string) => void }) => {
  const all = [
    ...filters.sources.map((v) => ({ key: "sources" as const, v })),
    ...filters.genres.map((v)  => ({ key: "genres"  as const, v })),
    ...filters.tags.map((v)    => ({ key: "tags"    as const, v })),
  ];
  if (all.length === 0) return null;
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 10 }}>
      {all.map(({ key, v }) => (
        <TouchableOpacity key={`${key}-${v}`} onPress={() => onRemove(key, v)} style={styles.activeChip}>
          <Text style={styles.activeChipText}>{v}</Text>
          <MaterialCommunityIcons name="close-circle" size={13} color="#38D926" style={{ marginLeft: 4 }} />
        </TouchableOpacity>
      ))}
    </ScrollView>
  );
};

// ─── Main Screen ──────────────────────────────────────────────────────────────

export const LibraryScreen = ({
  onSelectManga,
  onDeleteChapter,
  onDeleteManga,
  onRenameChapter,
  hideMode,
}: any) => {
  const [manga, setManga] = useState<MangaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [layout, setLayout] = useState<LayoutMode>("grid");
  const [hiddenList, setHiddenList] = useState<string[]>([]);
  const [pickerManga, setPickerManga] = useState<MangaEntry | null>(null);
  const [editingManga, setEditingManga] = useState<MangaEntry | null>(null);
  const [filterVisible, setFilterVisible] = useState(false);
  const [filters, setFilters] = useState<ActiveFilters>(EMPTY_FILTERS);
  const [flatMode, setFlatMode] = useState(false);

  const loadData = useCallback(async () => {
    const [library, hidden] = await Promise.all([readMangaLibrary(), getHiddenMangaList()]);
    setManga(library);
    setHiddenList(hidden);
    return library;
  }, []);

  useEffect(() => { loadData().then(() => setLoading(false)); }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, [loadData]);

  const { allTags, allGenres, allSources } = useMemo(() => {
    const tags = new Set<string>();
    const genres = new Set<string>();
    const sources = new Set<string>();
    manga.forEach((m) => {
      m.tags.forEach((t) => tags.add(t));
      m.genres.forEach((g) => genres.add(g));
      sources.add(m.source);
    });
    return {
      allTags: Array.from(tags).sort(),
      allGenres: Array.from(genres).sort(),
      allSources: Array.from(sources).sort(),
    };
  }, [manga]);

  const activeFilterCount = filters.tags.length + filters.genres.length + filters.sources.length;

  const filtered = useMemo(() => {
    let res = hideMode
      ? manga.filter((m) => hiddenList.includes(m.uid))
      : manga.filter((m) => !hiddenList.includes(m.uid));
    res = searchByTitle(res, search);
    res = applyFilters(res, filters);
    return sortManga(res, sortKey);
  }, [manga, search, sortKey, hiddenList, hideMode, filters]);

  const flatItems = useMemo<FlatItem[]>(() => {
    if (!flatMode) return [];
    return filtered.flatMap((m) => m.chapters.map((ch) => ({ manga: m, chapter: ch })));
  }, [flatMode, filtered]);

  const numColumns = layout === "grid" ? 2 : layout === "compact" ? 4 : 1;

  const removeFilter = useCallback((key: keyof ActiveFilters, value: string) => {
    setFilters((prev) => ({ ...prev, [key]: prev[key].filter((v) => v !== value) }));
  }, []);

  if (loading)
    return (
      <View style={{ flex: 1, backgroundColor: "#030712", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#38D926" />
      </View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: "#030712" }}>

      {/* ══════════════════════════════════════════
          ROW 1 — Title  +  Layout switcher
      ══════════════════════════════════════════ */}
      <View style={styles.row1}>
        <Text style={styles.title}>
          Manga <Text style={{ color: "#38D926" }}>Nest</Text>
        </Text>

        {/* Layout switcher */}
        <View style={styles.layoutSwitcher}>
          {(["hero", "list", "grid", "compact"] as LayoutMode[]).map((m) => (
            <TouchableOpacity
              key={m}
              onPress={() => setLayout(m)}
              style={[styles.layoutBtn, layout === m && styles.layoutBtnActive]}
            >
              <MaterialCommunityIcons
                name={m === "hero" ? "view-agenda" : m === "list" ? "view-list" : m === "grid" ? "view-grid" : "view-module"}
                size={16}
                color={layout === m ? "#38D926" : "#475569"}
              />
            </TouchableOpacity>
          ))}
        </View>
      </View>

      {/* ══════════════════════════════════════════
          ROW 2 — Search bar (full width)
      ══════════════════════════════════════════ */}
      <View style={styles.row2}>
        <View style={styles.searchWrapper}>
          <MaterialCommunityIcons name="magnify" size={16} color="#334155" style={{ marginRight: 8 }} />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search manga or author..."
            placeholderTextColor="#334155"
            style={styles.searchInput}
          />
          {search.length > 0 && (
            <TouchableOpacity onPress={() => setSearch("")}>
              <MaterialCommunityIcons name="close-circle" size={16} color="#334155" />
            </TouchableOpacity>
          )}
        </View>
      </View>

      {/* ══════════════════════════════════════════
          ROW 3 — Sort pills  ···  Refresh  Filter
      ══════════════════════════════════════════ */}
      <View style={styles.row3}>
        {/* Sort pills — scrollable, takes remaining space.
            Tapping an active pill flips it to its inverse. */}
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          style={{ flex: 1 }}
          contentContainerStyle={{ alignItems: "center", paddingRight: 8 }}
        >
          {SORT_PAIRS.map((pair) => {
            // Is either side of the pair currently active?
            const isPrimary = sortKey === pair.primary;
            const isInverse = sortKey === pair.inverse && pair.inverse !== pair.primary;
            const active    = isPrimary || isInverse;

            // What to show right now
            const label = isInverse ? pair.inverseLabel : pair.primaryLabel;
            const icon  = isInverse ? pair.inverseIcon  : pair.primaryIcon;

            const handlePress = () => {
              if (!active) {
                // Not yet active → activate with primary
                setSortKey(pair.primary);
              } else if (isPrimary) {
                // Active on primary → flip to inverse (if different)
                setSortKey(pair.inverse);
              } else {
                // Active on inverse → flip back to primary
                setSortKey(pair.primary);
              }
            };

            return (
              <TouchableOpacity
                key={pair.primary}
                onPress={handlePress}
                style={[styles.sortChip, active && styles.sortChipActive]}
              >
                <MaterialCommunityIcons
                  name={icon as any}
                  size={13}
                  color={active ? "#38D926" : "#475569"}
                  style={{ marginRight: 5 }}
                />
                <Text style={[styles.sortChipText, active && styles.sortChipTextActive]}>
                  {label}
                </Text>
                {/* Small arrow hint when active so user knows it's tappable */}
                {active && pair.primary !== pair.inverse && (
                  <MaterialCommunityIcons
                    name={isPrimary ? "chevron-down" : "chevron-up"}
                    size={12}
                    color="#38D926"
                    style={{ marginLeft: 2 }}
                  />
                )}
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        {/* Refresh */}
        <TouchableOpacity onPress={onRefresh} style={styles.iconBtn}>
          <MaterialCommunityIcons name="refresh" size={19} color="#38D926" />
        </TouchableOpacity>

        {/* Filter — badge shows active count */}
        <TouchableOpacity
          onPress={() => setFilterVisible(true)}
          style={[styles.iconBtn, activeFilterCount > 0 && styles.iconBtnActive]}
        >
          <MaterialCommunityIcons
            name="filter-variant"
            size={19}
            color={activeFilterCount > 0 ? "#38D926" : "#475569"}
          />
          {activeFilterCount > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{activeFilterCount}</Text>
            </View>
          )}
        </TouchableOpacity>
      </View>

      {/* ══════════════════════════════════════════
          ROW 4 — Active filter chips  (conditional)
      ══════════════════════════════════════════ */}
      {activeFilterCount > 0 && (
        <View style={{ paddingHorizontal: 16, paddingBottom: 8 }}>
          <ActiveFilterChips filters={filters} onRemove={removeFilter} />
        </View>
      )}

      {/* Flat mode banner (conditional) */}
      {flatMode && (
        <View style={styles.flatBanner}>
          <MaterialCommunityIcons name="format-list-bulleted-square" size={13} color="#38D926" />
          <Text style={styles.flatBannerText}>
            Single Episode View — {flatItems.length} episodes
          </Text>
          <TouchableOpacity onPress={() => setFlatMode(false)} style={{ marginLeft: "auto" }}>
            <MaterialCommunityIcons name="close" size={14} color="#38D926" />
          </TouchableOpacity>
        </View>
      )}

      {/* ══════════════════════════════════════════
          DATA
      ══════════════════════════════════════════ */}
      {flatMode ? (
        <FlatList
          key={`flat-${layout}`}
          data={flatItems}
          numColumns={numColumns}
          keyExtractor={(item) => `${item.manga.uid}-${item.chapter.ep}`}
          columnWrapperStyle={numColumns > 1 ? { justifyContent: "flex-start", gap: 8, paddingHorizontal: 12 } : null}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38D926" />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ width: numColumns === 1 ? "100%" : (SCREEN_WIDTH - (numColumns + 1) * 12) / numColumns }}
              onPress={() => onSelectManga(item.manga, item.chapter.ep)}
              onLongPress={() =>
                Alert.alert("Options", `${item.manga.name} — EP ${item.chapter.ep}`, [
                  { text: "Edit Manga Metadata",  onPress: () => setEditingManga(item.manga) },
                  { text: "Delete This Chapter",   style: "destructive", onPress: () => onDeleteChapter(item.manga.uid, item.chapter.ep) },
                  { text: "Delete Entire Manga",   style: "destructive", onPress: () => onDeleteManga(item.manga.uid) },
                  { text: "Cancel", style: "cancel" },
                ])
              }
            >
              <FlatCard item={item} mode={layout} />
            </TouchableOpacity>
          )}
        />
      ) : (
        <FlatList
          key={layout}
          data={filtered}
          numColumns={numColumns}
          keyExtractor={(item) => item.uid}
          columnWrapperStyle={numColumns > 1 ? { justifyContent: "flex-start", gap: 8, paddingHorizontal: 12 } : null}
          contentContainerStyle={{ paddingTop: 8, paddingBottom: 100 }}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38D926" />}
          renderItem={({ item }) => (
            <TouchableOpacity
              style={{ width: numColumns === 1 ? "100%" : (SCREEN_WIDTH - (numColumns + 1) * 12) / numColumns }}
              onPress={() =>
                item.chapters.length === 1
                  ? onSelectManga(item, item.chapters[0].ep)
                  : setPickerManga(item)
              }
              onLongPress={() =>
                Alert.alert("Options", item.name, [
                  { text: "Edit Metadata",         onPress: () => setEditingManga(item) },
                  { text: "Delete Library Entry",  style: "destructive", onPress: () => onDeleteManga(item.uid) },
                  { text: "Cancel", style: "cancel" },
                ])
              }
            >
              <AdaptiveCard item={item} mode={layout} />
            </TouchableOpacity>
          )}
        />
      )}

      {/* ── Modals ── */}
      <FilterModal
        visible={filterVisible}
        onClose={() => setFilterVisible(false)}
        allTags={allTags}
        allGenres={allGenres}
        allSources={allSources}
        filters={filters}
        onChange={setFilters}
        flatMode={flatMode}
        onToggleFlatMode={() => setFlatMode((p) => !p)}
      />

      {pickerManga && (
        <ChapterPickerModal
          visible={!!pickerManga}
          chapters={pickerManga.chapters}
          mangaName={pickerManga.name}
          mangaUid={pickerManga.uid}
          onSelectChapter={(ep: string) => { onSelectManga(pickerManga, ep); setPickerManga(null); }}
          onDeleteChapter={(ep: string) => onDeleteChapter(pickerManga.uid, ep)}
          onRenameChapter={async (oldEp: string, newEp: string) => {
            await onRenameChapter(pickerManga.uid, oldEp, newEp);
            const freshLibrary = await loadData();
            setPickerManga((prev) => {
              if (!prev) return null;
              const freshEntry = freshLibrary?.find((m) => m.uid === prev.uid);
              if (freshEntry) return freshEntry;
              return {
                ...prev,
                chapters: prev.chapters.map((c) => c.ep === oldEp ? { ...c, ep: newEp } : c),
              };
            });
          }}
          onClose={() => setPickerManga(null)}
        />
      )}

      {editingManga && (
        <EditMangaModal
          visible={!!editingManga}
          manga={editingManga}
          onClose={() => setEditingManga(null)}
          onSave={async (uid: string, data: any) => {
            await updateMangaMetadata(uid, data);
            await loadData();
            setEditingManga(null);
          }}
        />
      )}
    </View>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const styles = StyleSheet.create({
  // ── Header rows ──
  row1: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingTop: 52,
    paddingBottom: 14,
  },
  title: {
    color: "#f1f5f9",
    fontSize: 26,
    fontWeight: "900",
  },
  layoutSwitcher: {
    flexDirection: "row",
    backgroundColor: "#0a0e17",
    borderRadius: 10,
    padding: 3,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  layoutBtn: {
    padding: 6,
    borderRadius: 8,
  },
  layoutBtnActive: {
    backgroundColor: "#1e293b",
  },

  row2: {
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  searchWrapper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0a0e17",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderWidth: 1,
    borderColor: "#141c2b",
  },
  searchInput: {
    flex: 1,
    color: "#f1f5f9",
    fontSize: 14,
    padding: 0,
  },

  row3: {
    flexDirection: "row",
    alignItems: "center",
    paddingLeft: 16,
    paddingRight: 12,
    paddingBottom: 12,
    gap: 8,
  },
  sortChip: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 20,
    marginRight: 6,
    backgroundColor: "#0a0e17",
    borderWidth: 1,
    borderColor: "#141c2b",
  },
  sortChipActive: {
    backgroundColor: "#38D92615",
    borderColor: "#38D926",
  },
  sortChipText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "700",
  },
  sortChipTextActive: {
    color: "#38D926",
  },
  iconBtn: {
    padding: 8,
    backgroundColor: "#0a0e17",
    borderRadius: 10,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  iconBtnActive: {
    borderColor: "#38D926",
  },
  badge: {
    position: "absolute",
    top: -4,
    right: -4,
    backgroundColor: "#38D926",
    borderRadius: 8,
    width: 16,
    height: 16,
    justifyContent: "center",
    alignItems: "center",
  },
  badgeText: { color: "#030712", fontSize: 9, fontWeight: "900" },

  // ── Active filter chips ──
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#38D92615",
    borderRadius: 20,
    paddingHorizontal: 10,
    paddingVertical: 4,
    marginRight: 8,
    borderWidth: 1,
    borderColor: "#38D926",
  },
  activeChipText: { color: "#38D926", fontSize: 11, fontWeight: "700" },

  // ── Flat mode banner ──
  flatBanner: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#38D92610",
    marginHorizontal: 16,
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 7,
    marginBottom: 8,
    borderWidth: 1,
    borderColor: "#38D92630",
  },
  flatBannerText: {
    color: "#38D926",
    fontSize: 11,
    fontWeight: "700",
    marginLeft: 6,
  },

  // ── Card tag chips ──
  chip: {
    backgroundColor: "#0a0e17",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 3,
    marginRight: 6,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  chipText: { color: "#475569", fontSize: 10 },

  // ── Filter sheet ──
  filterSheet: {
    backgroundColor: "#080c12",
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: 1,
    borderColor: "#1e293b",
    maxHeight: "80%",
  },
  filterSectionLabel: {
    color: "#38D926",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginBottom: 12,
  },
  filterChip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  filterChipActive: { backgroundColor: "#38D92618", borderColor: "#38D926" },
  filterChipText: { color: "#475569", fontSize: 12, fontWeight: "600" },
  filterChipTextActive: { color: "#38D926" },

  flatToggle: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0f172a",
    borderRadius: 12,
    padding: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  flatToggleActive: { backgroundColor: "#38D92610", borderColor: "#38D926" },
  toggleDot: {
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  toggleDotActive: { backgroundColor: "#38D926", borderColor: "#38D926" },

  clearBtn: {
    flex: 1,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#0f172a",
    borderWidth: 1,
    borderColor: "#1e293b",
    alignItems: "center",
  },
  applyBtn: {
    flex: 2,
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: "#38D926",
    alignItems: "center",
  },
});