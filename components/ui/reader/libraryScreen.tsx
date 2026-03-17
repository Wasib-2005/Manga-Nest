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
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  readMangaLibrary,
  searchByTitle,
  filterByGenre,
  getFirstPageUri,
  type MangaEntry,
} from "../../../services/reader/libraryService";
import { getHiddenMangaList } from "../../../services/reader/readingProgressService";
import { ChapterPickerModal } from "./chapterPickerModal";

// ─── Sort & Types ──────────────────────────────────────────────────────────

type SortKey = "newest" | "oldest" | "az" | "za" | "most-pages" | "least-pages";

const SORT_OPTIONS: { key: SortKey; label: string; icon: string }[] = [
  { key: "newest", label: "Newest", icon: "clock-outline" },
  { key: "oldest", label: "Oldest", icon: "history" },
  { key: "az", label: "A → Z", icon: "sort-alphabetical-ascending" },
  { key: "za", label: "Z → A", icon: "sort-alphabetical-descending" },
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
    default: return copy;
  }
}

// ─── Sub-Components ─────────────────────────────────────────────────────────

const CoverImage = React.memo(function CoverImage({ uid, firstEp }: { uid: string; firstEp: string }) {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => { getFirstPageUri(uid, firstEp).then(setUri); }, [uid, firstEp]);

  return (
    <View style={{ width: 72, height: 100, borderRadius: 8, overflow: "hidden", backgroundColor: "#0f172a" }}>
      {uri ? (
        <Image source={{ uri: `file://${uri}` }} style={{ width: "100%", height: "100%" }} resizeMode="cover" />
      ) : (
        <View style={{ flex: 1, justifyContent: "center", alignItems: "center" }}>
          <MaterialCommunityIcons name="image-outline" size={22} color="#334155" />
        </View>
      )}
    </View>
  );
});
CoverImage.displayName = "CoverImage";

const MangaCard = React.memo(function MangaCard({ item }: { item: MangaEntry }) {
  const firstEp = item.chapters[0]?.ep ?? "";
  const srcColor = SRC_COLOR[item.source] ?? "#64748b";

  return (
    <View style={{ flexDirection: "row", gap: 12, backgroundColor: "#0a0e17", borderRadius: 12, padding: 12, marginBottom: 10, borderWidth: 1, borderColor: "#141c2b" }}>
      {firstEp ? <CoverImage uid={item.uid} firstEp={firstEp} /> : (
        <View style={{ width: 72, height: 100, borderRadius: 8, backgroundColor: "#0f172a", justifyContent: "center", alignItems: "center" }}>
          <MaterialCommunityIcons name="book-outline" size={26} color="#334155" />
        </View>
      )}
      <View style={{ flex: 1, justifyContent: "space-between" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start" }}>
          <Text style={{ color: "#f1f5f9", fontWeight: "700", fontSize: 14, flex: 1, marginRight: 8 }} numberOfLines={2}>{item.name}</Text>
          <View style={{ backgroundColor: srcColor + "20", borderRadius: 6, paddingHorizontal: 6, paddingVertical: 2, borderWidth: 1, borderColor: srcColor + "44" }}>
            <Text style={{ color: srcColor, fontSize: 10, fontWeight: "700" }}>{SRC_LABEL[item.source] || "?"}</Text>
          </View>
        </View>
        <View style={{ flexDirection: "row", gap: 10 }}>
          <Text style={{ color: "#64748b", fontSize: 11 }}>Eps: {item.chapters.length}</Text>
          <Text style={{ color: "#475569", fontSize: 11 }}>•</Text>
          <Text style={{ color: "#64748b", fontSize: 11 }}>{new Date(item.addedAt).toLocaleDateString()}</Text>
        </View>
      </View>
    </View>
  );
});
MangaCard.displayName = "MangaCard";

const Chip = React.memo(function Chip({ label, active, onPress, color }: any) {
  const c = color ?? "#38D926";
  return (
    <TouchableOpacity onPress={onPress} style={{
      paddingHorizontal: 11, paddingVertical: 5, borderRadius: 20, marginRight: 6,
      backgroundColor: active ? c + "20" : "#0a0e17",
      borderWidth: 1, borderColor: active ? c : "#141c2b",
    }}>
      <Text style={{ color: active ? c : "#475569", fontSize: 12, fontWeight: "600" }}>{label}</Text>
    </TouchableOpacity>
  );
});
Chip.displayName = "Chip";

// ─── Main Component ─────────────────────────────────────────────────────────

interface Props {
  onSelectManga: (manga: MangaEntry, chapter: string) => void;
  onDeleteChapter: (uid: string, ep: string) => void;
  onDeleteManga: (uid: string) => void;
  hideMode: boolean;
}

export const LibraryScreen = ({ onSelectManga, onDeleteChapter, onDeleteManga, hideMode }: Props) => {
  const [manga, setManga] = useState<MangaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<SortKey>("newest");
  const [hiddenList, setHiddenList] = useState<string[]>([]);
  const [pickerManga, setPickerManga] = useState<MangaEntry | null>(null);
  const [pickerOpen, setPickerOpen] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const [library, hidden] = await Promise.all([readMangaLibrary(), getHiddenMangaList()]);
      setHiddenList(hidden);
      setManga(library);
      setLoading(false);
    })();
  }, []);

  const handleLongPress = (item: MangaEntry) => {
    Alert.alert(
      "Delete Manga",
      `Are you sure you want to delete "${item.name}"? This will remove all downloaded chapters.`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDeleteManga(item.uid) },
      ]
    );
  };

  const filtered = useMemo(() => {
    let result = hideMode ? manga.filter(m => hiddenList.includes(m.uid)) : manga.filter(m => !hiddenList.includes(m.uid));
    result = searchByTitle(result, search);
    return sortManga(result, sortKey);
  }, [manga, search, sortKey, hiddenList, hideMode]);

  if (loading) {
    return (
      <View style={{ flex: 1, backgroundColor: "#030712", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#38D926" />
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: "#030712" }}>
      {/* Header Section */}
      <View style={{ paddingHorizontal: 16, paddingTop: 52, paddingBottom: 10, borderBottomWidth: 1, borderBottomColor: "#0a0e17" }}>
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <Text style={{ color: "#f1f5f9", fontSize: 22, fontWeight: "900" }}>
            Manga <Text style={{ color: "#38D926" }}>Nest</Text>
          </Text>
          <Text style={{ color: "#334155", fontSize: 12 }}>{filtered.length} titles</Text>
        </View>

        {/* Search Bar */}
        <View style={{ flexDirection: "row", alignItems: "center", backgroundColor: "#0a0e17", borderRadius: 10, paddingHorizontal: 10, paddingVertical: 8, borderWidth: 1, borderColor: "#141c2b" }}>
          <MaterialCommunityIcons name="magnify" size={18} color="#334155" />
          <TextInput
            value={search}
            onChangeText={setSearch}
            placeholder="Search your library..."
            placeholderTextColor="#334155"
            style={{ flex: 1, color: "#f1f5f9", marginLeft: 8, fontSize: 14 }}
          />
        </View>

        {/* Sort Chips */}
        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 12 }}>
          {SORT_OPTIONS.map((opt) => (
            <Chip
              key={opt.key}
              label={opt.label}
              active={sortKey === opt.key}
              onPress={() => setSortKey(opt.key)}
            />
          ))}
        </ScrollView>
      </View>

      {/* Manga List */}
      <FlatList
        data={filtered}
        keyExtractor={(item) => item.uid}
        renderItem={({ item }) => (
          <TouchableOpacity
            activeOpacity={0.7}
            onPress={() => {
              if (item.chapters.length === 1) onSelectManga(item, item.chapters[0].ep);
              else { setPickerManga(item); setPickerOpen(true); }
            }}
            onLongPress={() => handleLongPress(item)}
          >
            <MangaCard item={item} />
          </TouchableOpacity>
        )}
        contentContainerStyle={{ padding: 16, paddingBottom: 100 }}
        ListEmptyComponent={
          <View style={{ flex: 1, alignItems: "center", marginTop: 100 }}>
            <MaterialCommunityIcons name="bookshelf" size={48} color="#1e293b" />
            <Text style={{ color: "#475569", marginTop: 10 }}>Your library is empty</Text>
          </View>
        }
      />

      {/* Modals */}
      {pickerManga && (
        <ChapterPickerModal
          visible={pickerOpen}
          chapters={pickerManga.chapters}
          mangaName={pickerManga.name}
          mangaUid={pickerManga.uid}
          onSelectChapter={(ep) => { onSelectManga(pickerManga, ep); setPickerOpen(false); }}
          onDeleteChapter={(ep) => {
            onDeleteChapter(pickerManga.uid, ep);
            const remaining = pickerManga.chapters.filter((c) => c.ep !== ep);
            if (remaining.length === 0) {
              setPickerOpen(false);
              setPickerManga(null);
            } else {
              setPickerManga({ ...pickerManga, chapters: remaining });
            }
          }}
          onClose={() => { setPickerOpen(false); setPickerManga(null); }}
        />
      )}
    </View>
  );
};