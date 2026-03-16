import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LibraryScreen } from "../../components/ui/reader/libraryScreen";
import { PageViewer } from "../../components/ui/reader/pageViewer";
import { ReaderControls } from "../../components/ui/reader/readerControls";
import { HiddenMangaModal } from "../../components/ui/reader/hiddenMangaModal";
import {
  getChapterPages,
  type MangaEntry,
} from "../../services/reader/libraryService";
import {
  getReadingProgress,
  saveReadingProgress,
} from "../../services/reader/readingProgressService";

type Screen = "library" | "reader";

export default function ReaderScreen() {
  const [screen, setScreen] = useState<Screen>("library");
  const [selectedManga, setSelectedManga] = useState<MangaEntry | null>(null);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);

  const [zoom, setZoom] = useState(1);
  const [mode, setMode] = useState<"vertical" | "horizontal">("vertical");
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(0.5);

  const [hideModalVisible, setHideModalVisible] = useState(false);
  const [nestTaps, setNestTaps] = useState(0);

  const handleNestTap = () => {
    const newTaps = nestTaps + 1;
    setNestTaps(newTaps);

    if (newTaps === 5) {
      setNestTaps(0);
      setHideModalVisible(true);
    }
  };

  const handleSelectManga = async (manga: MangaEntry, chapter: string) => {
    setSelectedManga(manga);
    setSelectedChapter(chapter);

    try {
      const chapterPages = await getChapterPages(manga.uid, chapter);
      setPages(chapterPages);

      const lastPage = await getReadingProgress(manga.uid, chapter);
      setCurrentPage(Math.min(lastPage, chapterPages.length - 1));

      setScreen("reader");
    } catch (err) {
      Alert.alert("Error", "Failed to load chapter pages");
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedManga && selectedChapter) {
      saveReadingProgress(selectedManga.uid, selectedChapter, currentPage);
    }
  }, [currentPage, selectedManga, selectedChapter]);

  const handleJumpToPage = () => {
    Alert.prompt(
      "Jump to Page",
      `Enter page number (1-${pages.length}):`,
      [
        { text: "Cancel", onPress: () => {}, style: "cancel" },
        {
          text: "Go",
          onPress: (text: string | undefined) => {
            if (!text) return;
            const pageNum = parseInt(text, 10);
            if (!isNaN(pageNum) && pageNum >= 1 && pageNum <= pages.length) {
              setCurrentPage(pageNum - 1);
            } else {
              Alert.alert("Error", "Invalid page number");
            }
          },
        },
      ],
      "plain-text",
      String(currentPage + 1)
    );
  };

  const handleBackToLibrary = () => {
    setScreen("library");
    setSelectedManga(null);
    setSelectedChapter("");
    setPages([]);
    setNestTaps(0);
  };

  if (screen === "library") {
    return (
      <View className="flex-1">
        <LibraryScreen
          onSelectManga={handleSelectManga}
          hideMode={false}
        />

        <HiddenMangaModal
          visible={hideModalVisible}
          onClose={() => setHideModalVisible(false)}
        />

        <TouchableOpacity
          onPress={handleNestTap}
          className="absolute top-0 left-0 right-0 h-12 justify-center items-center"
          activeOpacity={0.8}
        />
      </View>
    );
  }

  if (screen === "reader") {
    return (
      <View className="flex-1 bg-black">
        {/* Header */}
        <View className="bg-gradient-to-r from-slate-950 to-gray-950 flex-row justify-between items-center px-4 py-4 border-b border-slate-800">
          <TouchableOpacity
            onPress={handleBackToLibrary}
            className="flex-row items-center gap-2 flex-1"
          >
            <MaterialCommunityIcons name="arrow-left" size={24} color="#10b981" />
            <View className="flex-1">
              <Text className="text-white font-bold text-sm" numberOfLines={1}>
                {selectedManga?.name}
              </Text>
              <Text className="text-xs text-slate-400">
                Chapter {selectedChapter}
              </Text>
            </View>
          </TouchableOpacity>

          <TouchableOpacity onPress={handleNestTap} className="ml-2">
            <MaterialCommunityIcons
              name="library-shelves"
              size={20}
              color="#64748b"
            />
          </TouchableOpacity>
        </View>

        {/* Page Viewer */}
        <View className="flex-1">
          <PageViewer
            pages={pages}
            initialPage={currentPage}
            onPageChange={setCurrentPage}
            onHideToggle={() => setHideModalVisible(true)}
            mode={mode}
            zoom={zoom}
            autoPlay={autoPlay}
            autoPlaySpeed={autoPlaySpeed}
          />
        </View>

        {/* Controls */}
        <ReaderControls
          zoom={zoom}
          onZoomChange={setZoom}
          mode={mode}
          onModeChange={setMode}
          autoPlay={autoPlay}
          onAutoPlayToggle={setAutoPlay}
          autoPlaySpeed={autoPlaySpeed}
          onSpeedChange={setAutoPlaySpeed}
          onJumpToPage={handleJumpToPage}
          currentPage={currentPage}
          totalPages={pages.length}
        />

        {/* Hidden Manga Modal */}
        <HiddenMangaModal
          visible={hideModalVisible}
          onClose={() => setHideModalVisible(false)}
        />
      </View>
    );
  }

  return null;
}