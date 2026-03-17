import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  Alert,
  StatusBar,
  SafeAreaView,
  BackHandler,
  Platform, // <-- Added BackHandler
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LibraryScreen } from "../../components/ui/reader/libraryScreen";
import {
  PageViewer,
  type ViewMode,
} from "../../components/ui/reader/pageViewer";
import { SettingsModal } from "../../components/ui/reader/settingsModal";
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
  const [mode, setMode] = useState<ViewMode>("horizontal");
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(2);
  const [settingsVisible, setSettingsVisible] = useState(false);
  const [hideVisible, setHideVisible] = useState(false);
  const [nestTaps, setNestTaps] = useState(0);

  const handleNestTap = () => {
    const next = nestTaps + 1;
    setNestTaps(next);
    if (next >= 5) {
      setNestTaps(0);
      setHideVisible(true);
    }
  };

  const handleSelectManga = async (manga: MangaEntry, chapter: string) => {
    setSelectedManga(manga);
    setSelectedChapter(chapter);
    try {
      const chapterPages = await getChapterPages(manga.uid, chapter);
      const lastPage = await getReadingProgress(manga.uid, chapter);
      setPages(chapterPages);
      setCurrentPage(Math.min(lastPage, Math.max(0, chapterPages.length - 1)));
      setAutoPlay(false);
      setScreen("reader");
    } catch (err) {
      Alert.alert("Error", "Failed to load chapter");
      console.error(err);
    }
  };

  useEffect(() => {
    if (selectedManga && selectedChapter && pages.length > 0) {
      saveReadingProgress(selectedManga.uid, selectedChapter, currentPage);
    }
  }, [currentPage]);

  const handleBack = () => {
    setScreen("library");
    setSelectedManga(null);
    setSelectedChapter("");
    setPages([]);
    setNestTaps(0);
    setAutoPlay(false);
  };

  // 👇 ADDED: Hardware Back Button Listener 👇
  useEffect(() => {
    const backAction = () => {
      // If we are currently reading, intercept the back button
      if (screen === "reader") {
        handleBack();
        return true; // Returning true tells React Native we handled the back press
      }
      // If we are in the library, let the system handle it (close app/go back)
      return false;
    };

    const backHandler = BackHandler.addEventListener(
      "hardwareBackPress",
      backAction,
    );

    // Cleanup the event listener on unmount or when screen state changes
    return () => backHandler.remove();
  }, [screen]);
  // 👆 END OF BACK HANDLER 👆

  // ── Library ────────────────────────────────────────────────────────────────
  if (screen === "library") {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#030712" />
        <LibraryScreen onSelectManga={handleSelectManga} hideMode={false} />
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleNestTap}
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 48,
          }}
        />
        <HiddenMangaModal
          visible={hideVisible}
          onClose={() => setHideVisible(false)}
        />
      </View>
    );
  }

  // ── Reader ─────────────────────────────────────────────────────────────────
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#030712",
        // This adds padding only on Android if needed, iOS is handled by SafeAreaView
        paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
      }}
    >
      <StatusBar barStyle="light-content" backgroundColor="#030912" />

      {/* Header: back | title+chapter | page count | settings */}
      <SafeAreaView style={{ backgroundColor: "#030912" }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            paddingHorizontal: 12,
            paddingVertical: 10,
            borderBottomWidth: 1,
            borderBottomColor: "#0a0e17",
            gap: 10,
          }}
        >
          <TouchableOpacity
            onPress={handleBack}
            style={{ padding: 6, borderRadius: 8, backgroundColor: "#0a0e17" }}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <MaterialCommunityIcons
              name="arrow-left"
              size={20}
              color="#f1f5f9"
            />
          </TouchableOpacity>

          <View style={{ flex: 1 }}>
            <Text
              style={{ color: "#f1f5f9", fontWeight: "700", fontSize: 14 }}
              numberOfLines={1}
            >
              {selectedManga?.name}
            </Text>
            {selectedChapter ? (
              <Text
                style={{ color: "#334155", fontSize: 11 }}
                numberOfLines={1}
              >
               Chapter: {selectedChapter}
              </Text>
            ) : null}
          </View>

          <View
            style={{
              backgroundColor: "#0a0e17",
              borderRadius: 8,
              paddingHorizontal: 10,
              paddingVertical: 5,
              borderWidth: 1,
              borderColor: "#141c2b",
            }}
          >
            <Text style={{ color: "#94a3b8", fontSize: 13, fontWeight: "600" }}>
              {currentPage + 1}
              <Text style={{ color: "#334155" }}> / {pages.length}</Text>
            </Text>
          </View>

          <TouchableOpacity
            onPress={() => setSettingsVisible(true)}
            style={{
              padding: 6,
              borderRadius: 8,
              backgroundColor: "#0a0e17",
              borderWidth: 1,
              borderColor: settingsVisible ? "#38D926" : "#141c2b",
            }}
            hitSlop={{ top: 8, right: 8, bottom: 8, left: 8 }}
          >
            <MaterialCommunityIcons
              name="cog-outline"
              size={20}
              color={settingsVisible ? "#38D926" : "#475569"}
            />
          </TouchableOpacity>
        </View>
      </SafeAreaView>

      {/* Page viewer */}
      <View style={{ flex: 1 }}>
        <PageViewer
          pages={pages}
          initialPage={currentPage}
          onPageChange={setCurrentPage}
          mode={mode}
          autoPlay={autoPlay}
          autoPlaySpeed={autoPlaySpeed}
        />
      </View>

      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          if (m !== "autoplay") setAutoPlay(false);
        }}
        autoPlay={autoPlay}
        onAutoPlay={setAutoPlay}
        autoPlaySpeed={autoPlaySpeed}
        onSpeedChange={setAutoPlaySpeed}
        currentPage={currentPage}
        totalPages={pages.length}
        onJumpToPage={(p) =>
          setCurrentPage(Math.min(Math.max(0, p), pages.length - 1))
        }
      />

      <HiddenMangaModal
        visible={hideVisible}
        onClose={() => setHideVisible(false)}
      />
    </View>
  );
}
