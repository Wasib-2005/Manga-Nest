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
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  readMangaLibrary,
  searchByTitle,
  getFirstPageUri,
  type MangaEntry,
} from "../../../services/reader/libraryService";
import { getHiddenMangaList } from "../../../services/reader/readingProgressService";
import { ChapterPickerModal } from "./chapterPickerModal";

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get("window");

type SortKey = "newest" | "oldest" | "az" | "za" | "most-eps" | "least-eps" | "source";
type LayoutMode = "hero" | "list" | "grid" | "compact";

const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
  { key: "newest", label: "Newest", icon: "clock-outline" },
  { key: "az", label: "A → Z", icon: "sort-alphabetical-ascending" },
  { key: "most-eps", label: "Most Eps", icon: "library-shelves" },
  { key: "source", label: "Source", icon: "database-outline" },
];

const SRC_LABEL: Record<string, string> = { nhentai: "nH", mangadex: "MD", sequential: "SQ" };
const SRC_COLOR: Record<string, string> = { nhentai: "#f97316", mangadex: "#3b82f6", sequential: "#a855f7" };

function sortManga(list: MangaEntry[], key: SortKey): MangaEntry[] {
  const copy = [...list];
  switch (key) {
    case "az": return copy.sort((a, b) => a.name.localeCompare(b.name));
    case "za": return copy.sort((a, b) => b.name.localeCompare(a.name));
    case "newest": return copy.sort((a, b) => +new Date(b.addedAt) - +new Date(a.addedAt));
    case "oldest": return copy.sort((a, b) => +new Date(a.addedAt) - +new Date(b.addedAt));
    case "most-eps": return copy.sort((a, b) => b.chapters.length - a.chapters.length);
    case "least-eps": return copy.sort((a, b) => a.chapters.length - b.chapters.length);
    case "source": return copy.sort((a, b) => a.source.localeCompare(b.source));
    default: return copy;
  }
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

const AutoHeightImage = React.memo(({ uri }: { uri: string }) => {
  const [aspectRatio, setAspectRatio] = useState(3 / 4);
  useEffect(() => {
    Image.getSize(`file://${uri}`, (w, h) => { if (w && h) setAspectRatio(w / h); }, () => {});
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

const CoverImage = React.memo(({ uid, firstEp, autoHeight }: { uid: string; firstEp: string; autoHeight?: boolean }) => {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { getFirstPageUri(uid, firstEp).then(setUri); }, [uid, firstEp]);

  if (!uri) return (
    <View style={{ width: '100%', height: 120, borderRadius: 12, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
      <MaterialCommunityIcons name="image-off-outline" size={24} color="#1e293b" />
    </View>
  );

  return autoHeight ? <AutoHeightImage uri={uri} /> : (
    <Image source={{ uri: `file://${uri}` }} style={{ width: "100%", height: "100%", borderRadius: 12 }} resizeMode="cover" />
  );
});
CoverImage.displayName = "CoverImage";

const AdaptiveCard = React.memo(({ item, mode }: { item: MangaEntry; mode: LayoutMode }) => {
  const firstEp = item.chapters[0]?.ep ?? "";
  const srcColor = SRC_COLOR[item.source] ?? "#64748b";
  const dateStr = new Date(item.addedAt).toLocaleDateString();

  if (mode === "hero") {
    return (
      <View style={{ marginBottom: 32, paddingHorizontal: 16 }}>
        <CoverImage uid={item.uid} firstEp={firstEp} autoHeight />
        <View style={{ marginTop: 14 }}>
          <View style={{ flexDirection: 'row', justifyContent: 'space-between' }}>
            <Text style={{ color: srcColor, fontWeight: "900", fontSize: 12 }}>{item.source.toUpperCase()}</Text>
            <Text style={{ color: "#475569", fontSize: 11 }}>{dateStr}</Text>
          </View>
          <Text style={{ color: "#f1f5f9", fontWeight: "900", fontSize: 22, marginTop: 4 }}>{item.name}</Text>
          {item.author ? <Text style={{ color: "#38D926", fontSize: 14, marginTop: 2 }}>by {item.author}</Text> : null}
          
          <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
            {item.tags.slice(0, 5).map((t, i) => (
              <View key={i} style={{ backgroundColor: "#1e293b", paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6 }}>
                <Text style={{ color: "#94a3b8", fontSize: 10 }}>#{t}</Text>
              </View>
            ))}
          </View>

          <View style={{ flexDirection: 'row', alignItems: 'center', marginTop: 12, backgroundColor: "#0a0e17", padding: 10, borderRadius: 8, borderWidth: 1, borderColor: "#1e293b" }}>
            <MaterialCommunityIcons name="library-shelves" size={18} color="#38D926" />
            <Text style={{ color: "#f1f5f9", marginLeft: 8, fontWeight: "600" }}>{item.chapters.length} Chapters stored locally</Text>
          </View>
        </View>
      </View>
    );
  }

  if (mode === "list") {
    return (
      <View style={{ flexDirection: "row", gap: 14, backgroundColor: "#0a0e17", borderRadius: 16, padding: 12, marginBottom: 12, marginHorizontal: 16, borderWidth: 1, borderColor: "#141c2b" }}>
        <View style={{ width: 80, height: 110 }}><CoverImage uid={item.uid} firstEp={firstEp} /></View>
        <View style={{ flex: 1, justifyContent: "space-between" }}>
          <View>
            <Text style={{ color: srcColor, fontSize: 10, fontWeight: "900" }}>{SRC_LABEL[item.source]}</Text>
            <Text style={{ color: "#f1f5f9", fontWeight: "700", fontSize: 15 }} numberOfLines={2}>{item.name}</Text>
            <Text style={{ color: "#475569", fontSize: 11, marginTop: 2 }} numberOfLines={1}>{item.author}</Text>
          </View>
          <Text style={{ color: "#38D926", fontSize: 12, fontWeight: "800" }}>{item.chapters.length} Eps</Text>
        </View>
      </View>
    );
  }

  const isCompact = mode === "compact";
  return (
    <View style={{ marginBottom: 20 }}>
      <CoverImage uid={item.uid} firstEp={firstEp} autoHeight />
      <View style={{ marginTop: 8, paddingHorizontal: 4 }}>
        <Text style={{ color: srcColor, fontSize: 9, fontWeight: "900" }}>{SRC_LABEL[item.source]}</Text>
        <Text style={{ color: "#f1f5f9", fontWeight: "600", fontSize: isCompact ? 11 : 13 }} numberOfLines={2}>{item.name}</Text>
        <Text style={{ color: "#38D926", fontSize: 10, fontWeight: "700", marginTop: 2 }}>{item.chapters.length} Eps</Text>
      </View>
    </View>
  );
});
AdaptiveCard.displayName = "AdaptiveCard";

// ─── Main Screen ────────────────────────────────────────────────────────────

export const LibraryScreen = ({ onSelectManga, onDeleteChapter, onDeleteManga, hideMode }: any) => {
  const [manga, setManga] = useState<MangaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [layout, setLayout] = useState<LayoutMode>("hero");
  const [hiddenList, setHiddenList] = useState<string[]>([]);
  const [pickerManga, setPickerManga] = useState<MangaEntry | null>(null);

  const loadData = async () => {
    const [library, hidden] = await Promise.all([readMangaLibrary(), getHiddenMangaList()]);
    setManga(library);
    setHiddenList(hidden);
  };

  useEffect(() => {
    loadData().then(() => setLoading(false));
  }, []);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await loadData();
    setRefreshing(false);
  }, []);

  const filtered = useMemo(() => {
    let res = hideMode ? manga.filter(m => hiddenList.includes(m.uid)) : manga.filter(m => !hiddenList.includes(m.uid));
    res = searchByTitle(res, search);
    return sortManga(res, sortKey);
  }, [manga, search, sortKey, hiddenList, hideMode]);

  const numColumns = (layout === "grid") ? 2 : (layout === "compact" ? 3 : 1);

  if (loading) return (
    <View style={{ flex: 1, backgroundColor: "#030712", justifyContent: "center" }}>
      <ActivityIndicator size="large" color="#38D926" />
    </View>
  );

  return (
    <View style={{ flex: 1, backgroundColor: "#030712" }}>
      <View style={{ paddingHorizontal: 16, paddingTop: 52, paddingBottom: 12 }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <Text style={{ color: "#f1f5f9", fontSize: 26, fontWeight: "900" }}>Nest <Text style={{ color: "#38D926" }}>Library</Text></Text>
          
          <View style={{ flexDirection: "row", alignItems: 'center', gap: 8 }}>
            {/* Refresh Button */}
            <TouchableOpacity 
              onPress={onRefresh}
              disabled={refreshing}
              style={{ padding: 8, backgroundColor: "#0a0e17", borderRadius: 10, borderWidth: 1, borderColor: "#1e293b" }}
            >
              {refreshing ? (
                <ActivityIndicator size={18} color="#38D926" />
              ) : (
                <MaterialCommunityIcons name="refresh" size={20} color="#38D926" />
              )}
            </TouchableOpacity>

            <View style={{ flexDirection: "row", backgroundColor: "#0a0e17", borderRadius: 10, padding: 3, borderWidth: 1, borderColor: "#1e293b" }}>
              {(["hero", "list", "grid", "compact"] as LayoutMode[]).map(m => (
                <TouchableOpacity key={m} onPress={() => setLayout(m)} style={{ 
                  padding: 6, borderRadius: 8, backgroundColor: layout === m ? "#1e293b" : "transparent" 
                }}>
                  <MaterialCommunityIcons 
                    name={m === "hero" ? "view-agenda" : m === "list" ? "view-list" : m === "grid" ? "view-grid" : "view-module"} 
                    size={18} color={layout === m ? "#38D926" : "#475569"} 
                  />
                </TouchableOpacity>
              ))}
            </View>
          </View>
        </View>

        <TextInput
          value={search} onChangeText={setSearch} placeholder="Search titles, authors..." placeholderTextColor="#334155"
          style={{ backgroundColor: "#0a0e17", borderRadius: 12, padding: 12, color: "#f1f5f9", borderWidth: 1, borderColor: "#141c2b" }}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 14 }}>
          {SORT_OPTIONS.map(opt => (
            <TouchableOpacity key={opt.key} onPress={() => setSortKey(opt.key)} style={{
              flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingVertical: 6, borderRadius: 20, marginRight: 8,
              backgroundColor: sortKey === opt.key ? "#38D92615" : "#0a0e17", borderWidth: 1, borderColor: sortKey === opt.key ? "#38D926" : "#141c2b",
            }}>
              <MaterialCommunityIcons name={opt.icon as any} size={14} color={sortKey === opt.key ? "#38D926" : "#475569"} style={{ marginRight: 6 }} />
              <Text style={{ color: sortKey === opt.key ? "#38D926" : "#475569", fontSize: 12, fontWeight: "700" }}>{opt.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>
      </View>

      <FlatList
        key={layout}
        data={filtered}
        numColumns={numColumns}
        keyExtractor={item => item.uid}
        columnWrapperStyle={numColumns > 1 ? { justifyContent: "flex-start", gap: 12, paddingHorizontal: 16 } : null}
        contentContainerStyle={{ paddingBottom: 100 }}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor="#38D926" />
        }
        renderItem={({ item }) => (
          <TouchableOpacity 
            style={{ width: numColumns === 1 ? '100%' : (SCREEN_WIDTH - (numColumns + 1) * 16) / numColumns }}
            onPress={() => {
              if (item.chapters.length === 1) onSelectManga(item, item.chapters[0].ep);
              else setPickerManga(item);
            }}
            onLongPress={() => Alert.alert("Options", item.name, [
              { text: "Cancel", style: "cancel" },
              { text: "Delete Library Entry", style: "destructive", onPress: () => onDeleteManga(item.uid) }
            ])}
          >
            <AdaptiveCard item={item} mode={layout} />
          </TouchableOpacity>
        )}
      />

      {pickerManga && (
        <ChapterPickerModal
          visible={!!pickerManga}
          chapters={pickerManga.chapters}
          mangaName={pickerManga.name}
          mangaUid={pickerManga.uid}
          onSelectChapter={(ep) => { onSelectManga(pickerManga, ep); setPickerManga(null); }}
          onDeleteChapter={(ep) => onDeleteChapter(pickerManga.uid, ep)}
          onClose={() => setPickerManga(null)}
        />
      )}
    </View>
  );
};