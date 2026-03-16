import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  readMangaLibrary,
  filterByGenre,
  filterByAuthor,
  searchByTitle,
  type MangaEntry,
} from "../../../services/reader/libraryService";
import { getHiddenMangaList } from "../../../services/reader/readingProgressService";
import { ChapterPickerModal } from "./chapterPickerModal";

interface Props {
  onSelectManga: (manga: MangaEntry, chapter: string) => void;
  hideMode: boolean;
}

export const LibraryScreen = ({ onSelectManga, hideMode }: Props) => {
  const [manga, setManga] = useState<MangaEntry[]>([]);
  const [filtered, setFiltered] = useState<MangaEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [genreFilter, setGenreFilter] = useState("");
  const [authorFilter, setAuthorFilter] = useState("");
  const [allGenres, setAllGenres] = useState<string[]>([]);
  const [allAuthors, setAllAuthors] = useState<string[]>([]);
  const [hiddenList, setHiddenList] = useState<string[]>([]);

  // Chapter picker state
  const [selectedMangaForChapter, setSelectedMangaForChapter] = useState<MangaEntry | null>(null);
  const [chapterPickerVisible, setChapterPickerVisible] = useState(false);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const library = await readMangaLibrary();
      const hidden = await getHiddenMangaList();
      setHiddenList(hidden);

      const genreSet = new Set<string>();
      const authorSet = new Set<string>();
      library.forEach((m) => {
        m.genres.forEach((g) => genreSet.add(g));
        if (m.author) authorSet.add(m.author);
      });

      setAllGenres(Array.from(genreSet).sort());
      setAllAuthors(Array.from(authorSet).sort());
      setManga(library);
      setLoading(false);
    };

    load();
  }, []);

  useEffect(() => {
    let result = [...manga];

    if (hideMode) {
      result = result.filter((m) => hiddenList.includes(m.uid));
    } else {
      result = result.filter((m) => !hiddenList.includes(m.uid));
    }

    result = searchByTitle(result, searchQuery);
    result = filterByGenre(result, genreFilter);
    result = filterByAuthor(result, authorFilter);

    setFiltered(result);
  }, [manga, searchQuery, genreFilter, authorFilter, hiddenList, hideMode]);

  const handleMangaTap = (item: MangaEntry) => {
    // If only one chapter, go directly to reader
    if (item.chapters.length === 1) {
      onSelectManga(item, item.chapters[0].ep);
    } else {
      // Show chapter picker for multiple chapters
      setSelectedMangaForChapter(item);
      setChapterPickerVisible(true);
    }
  };

  const handleChapterSelect = (ep: string) => {
    if (selectedMangaForChapter) {
      onSelectManga(selectedMangaForChapter, ep);
      setChapterPickerVisible(false);
    }
  };

  const renderMangaCard = (item: MangaEntry) => (
    <TouchableOpacity
      onPress={() => handleMangaTap(item)}
      className="bg-gradient-to-br from-slate-800 to-slate-900 rounded-2xl p-4 mb-4 border border-slate-700 active:opacity-70 shadow-lg"
    >
      {/* Title */}
      <Text className="text-base font-bold text-white mb-1" numberOfLines={2}>
        {item.name}
      </Text>

      {/* Author */}
      {item.author && (
        <View className="flex-row items-center gap-1 mb-2">
          <MaterialCommunityIcons name="pencil" size={14} color="#94a3b8" />
          <Text className="text-xs text-slate-400">{item.author}</Text>
        </View>
      )}

      {/* Genres */}
      {item.genres.length > 0 && (
        <View className="flex-row flex-wrap gap-1.5 mb-3">
          {item.genres.slice(0, 2).map((genre, i) => (
            <View
              key={i}
              className="bg-emerald-500/20 rounded-full px-2.5 py-1 border border-emerald-500/40"
            >
              <Text className="text-xs font-medium text-emerald-400">
                {genre}
              </Text>
            </View>
          ))}
          {item.genres.length > 2 && (
            <View className="bg-slate-700/50 rounded-full px-2.5 py-1">
              <Text className="text-xs font-medium text-slate-300">
                +{item.genres.length - 2}
              </Text>
            </View>
          )}
        </View>
      )}

      {/* Chapters & Source */}
      <View className="flex-row justify-between items-center pt-2 border-t border-slate-700">
        <View className="flex-row items-center gap-1">
          <MaterialCommunityIcons name="book" size={14} color="#94a3b8" />
          <Text className="text-xs text-slate-400">
            {item.chapters.length} chapter{item.chapters.length !== 1 ? "s" : ""}
          </Text>
        </View>

        <View className="flex-row items-center gap-1">
          {item.chapters.length > 1 && (
            <MaterialCommunityIcons
              name="chevron-right"
              size={16}
              color="#10b981"
            />
          )}
          <View className="bg-slate-700 rounded-full px-2.5 py-1">
            <Text className="text-xs font-semibold text-emerald-400">
              {item.source === "nhentai"
                ? "nH"
                : item.source === "mangadex"
                ? "MD"
                : "SEQ"}
            </Text>
          </View>
        </View>
      </View>
    </TouchableOpacity>
  );

  if (loading) {
    return (
      <View className="flex-1 bg-gradient-to-b from-gray-950 to-slate-950 justify-center items-center">
        <ActivityIndicator size="large" color="#10b981" />
        <Text className="text-gray-400 mt-3 text-sm">Loading manga...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gradient-to-b from-gray-950 to-slate-950">
      <ScrollView
        contentContainerStyle={{
          paddingHorizontal: 16,
          paddingTop: 20,
          paddingBottom: 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View className="mb-6">
          <View className="flex-row items-baseline gap-2 mb-1">
            <Text className="text-3xl font-black text-white">Manga</Text>
            <Text className="text-2xl font-black text-emerald-500">Nest</Text>
          </View>
          <Text className="text-xs text-slate-400 font-medium">
            {hideMode
              ? "🔒 Hidden Collection"
              : `📚 ${filtered.length} manga found`}
          </Text>
        </View>

        {/* Search */}
        <View className="mb-5">
          <View className="flex-row items-center gap-2 bg-slate-800/50 border border-slate-700 rounded-xl px-3 py-2.5">
            <MaterialCommunityIcons name="magnify" size={20} color="#94a3b8" />
            <TextInput
              value={searchQuery}
              onChangeText={setSearchQuery}
              placeholder="Search by title..."
              placeholderTextColor="#64748b"
              className="flex-1 text-white text-sm"
            />
            {searchQuery !== "" && (
              <TouchableOpacity onPress={() => setSearchQuery("")}>
                <MaterialCommunityIcons
                  name="close-circle"
                  size={18}
                  color="#94a3b8"
                />
              </TouchableOpacity>
            )}
          </View>
        </View>

        {/* Filters */}
        {!hideMode && (
          <>
            {/* Genre Filter */}
            {allGenres.length > 0 && (
              <View className="mb-4">
                <Text className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                  Genre
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    onPress={() => setGenreFilter("")}
                    className={`px-3.5 py-1.5 rounded-full mr-2 border ${
                      genreFilter === ""
                        ? "bg-emerald-500 border-emerald-500"
                        : "bg-slate-800/50 border-slate-700"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        genreFilter === "" ? "text-white" : "text-slate-300"
                      }`}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {allGenres.map((genre) => (
                    <TouchableOpacity
                      key={genre}
                      onPress={() => setGenreFilter(genre)}
                      className={`px-3.5 py-1.5 rounded-full mr-2 border ${
                        genreFilter === genre
                          ? "bg-emerald-500 border-emerald-500"
                          : "bg-slate-800/50 border-slate-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          genreFilter === genre
                            ? "text-white"
                            : "text-slate-300"
                        }`}
                      >
                        {genre}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}

            {/* Author Filter */}
            {allAuthors.length > 0 && (
              <View className="mb-6">
                <Text className="text-xs font-bold text-slate-300 mb-2 uppercase tracking-wider">
                  Author
                </Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <TouchableOpacity
                    onPress={() => setAuthorFilter("")}
                    className={`px-3.5 py-1.5 rounded-full mr-2 border ${
                      authorFilter === ""
                        ? "bg-emerald-500 border-emerald-500"
                        : "bg-slate-800/50 border-slate-700"
                    }`}
                  >
                    <Text
                      className={`text-xs font-semibold ${
                        authorFilter === "" ? "text-white" : "text-slate-300"
                      }`}
                    >
                      All
                    </Text>
                  </TouchableOpacity>
                  {allAuthors.map((author) => (
                    <TouchableOpacity
                      key={author}
                      onPress={() => setAuthorFilter(author)}
                      className={`px-3.5 py-1.5 rounded-full mr-2 border ${
                        authorFilter === author
                          ? "bg-emerald-500 border-emerald-500"
                          : "bg-slate-800/50 border-slate-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          authorFilter === author
                            ? "text-white"
                            : "text-slate-300"
                        }`}
                      >
                        {author.substring(0, 12)}
                        {author.length > 12 ? "..." : ""}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            )}
          </>
        )}

        {/* Manga List */}
        {filtered.length === 0 ? (
          <View className="flex-1 justify-center items-center mt-12">
            <MaterialCommunityIcons
              name={hideMode ? "lock" : "inbox"}
              size={48}
              color="#64748b"
            />
            <Text className="text-slate-400 text-center mt-3 text-sm">
              {hideMode ? "No hidden manga yet" : "No manga found"}
            </Text>
          </View>
        ) : (
          <View>
            {filtered.map((item) => (
              <View key={item.uid}>{renderMangaCard(item)}</View>
            ))}
          </View>
        )}
      </ScrollView>

      {/* Chapter Picker Modal */}
      {selectedMangaForChapter && (
        <ChapterPickerModal
          visible={chapterPickerVisible}
          chapters={selectedMangaForChapter.chapters}
          mangaName={selectedMangaForChapter.name}
          onSelectChapter={handleChapterSelect}
          onClose={() => {
            setChapterPickerVisible(false);
            setSelectedMangaForChapter(null);
          }}
        />
      )}
    </View>
  );
};