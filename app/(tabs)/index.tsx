import React, { useState, useEffect } from "react";
import {
  View,
  StatusBar,
  BackHandler,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { LibraryScreen } from "../../components/ui/reader/libraryScreen";
import { ReaderScreen } from "../../components/ui/reader/readerScreen";
import { HiddenMangaModal } from "../../components/ui/reader/hiddenMangaModal";
import {
  getChapterPages,
  renameChapterEp,
  type MangaEntry,
} from "../../services/reader/libraryService";
import {
  getReadingProgress,
  saveReadingProgress,
} from "../../services/reader/readingProgressService";
import { deleteChapterFiles, deleteFullManga } from "../../services/reader/deleteManga";
import { TouchableOpacity } from "react-native";
import type { ViewMode } from "../../components/ui/reader/pageViewer";

type Screen = "library" | "reader";

export default function Index() {
  const [screen, setScreen] = useState<Screen>("library");
  const [selectedManga, setSelectedManga] = useState<MangaEntry | null>(null);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(0);
  const [mode, setMode] = useState<ViewMode>("horizontal");
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(2);
  const [hideVisible, setHideVisible] = useState(false);
  const [nestTaps, setNestTaps] = useState(0);
  const [refreshKey, setRefreshKey] = useState(0);

  // ── Hidden manga easter egg (5 taps on top bar) ───────────────────────────
  const handleNestTap = () => {
    const next = nestTaps + 1;
    setNestTaps(next);
    if (next >= 5) {
      setNestTaps(0);
      setHideVisible(true);
    }
  };

  // ── Open a chapter ────────────────────────────────────────────────────────
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

  // ── Deletion ──────────────────────────────────────────────────────────────
  const onDeleteChapter = async (uid: string, ep: string) => {
    try {
      const wasFullMangaDeleted = await deleteChapterFiles(uid, ep);
      if (wasFullMangaDeleted && selectedManga?.uid === uid) {
        setScreen("library");
        setSelectedManga(null);
      }
      setRefreshKey((prev) => prev + 1);
    } catch {
      Alert.alert("Error", "Failed to delete chapter");
    }
  };

  const onDeleteManga = async (uid: string) => {
    try {
      await deleteFullManga(uid);
      if (selectedManga?.uid === uid) {
        setScreen("library");
        setSelectedManga(null);
      }
      setRefreshKey((prev) => prev + 1);
    } catch {
      Alert.alert("Error", "Failed to delete manga from library");
    }
  };

  const onRenameChapter = async (uid: string, oldEp: string, newEp: string) => {
    try {
      await renameChapterEp(uid, oldEp, newEp);
      if (selectedManga?.uid === uid && selectedChapter === oldEp) {
        setSelectedChapter(newEp);
      }
      setRefreshKey((prev) => prev + 1);
    } catch {
      Alert.alert("Error", "Failed to rename chapter");
    }
  };

  // ── Save reading progress ─────────────────────────────────────────────────
  useEffect(() => {
    if (selectedManga && selectedChapter && pages.length > 0) {
      saveReadingProgress(selectedManga.uid, selectedChapter, currentPage);
    }
  }, [currentPage]);

  // ── Back navigation ───────────────────────────────────────────────────────
  const handleBack = () => {
    setScreen("library");
    setSelectedManga(null);
    setSelectedChapter("");
    setPages([]);
    setNestTaps(0);
    setAutoPlay(false);
    setRefreshKey((prev) => prev + 1);
  };

  useEffect(() => {
    const backAction = () => {
      if (screen === "reader") {
        handleBack();
        return true;
      }
      return false;
    };
    const sub = BackHandler.addEventListener("hardwareBackPress", backAction);
    return () => sub.remove();
  }, [screen]);

  // ── Library screen ────────────────────────────────────────────────────────
  if (screen === "library") {
    return (
      <View style={{ flex: 1 }}>
        <StatusBar barStyle="light-content" backgroundColor="#030712" />
        <LibraryScreen
          key={refreshKey}
          onSelectManga={handleSelectManga}
          onDeleteChapter={onDeleteChapter}
          onDeleteManga={onDeleteManga}
          onRenameChapter={onRenameChapter}
          hideMode={false}
        />
        {/* Hidden manga easter egg tap zone */}
        <TouchableOpacity
          activeOpacity={1}
          onPress={handleNestTap}
          style={{ position: "absolute", top: 0, left: 0, right: 0, height: 48 }}
        />
        <HiddenMangaModal
          visible={hideVisible}
          onClose={() => setHideVisible(false)}
        />
      </View>
    );
  }

  // ── Reader screen ─────────────────────────────────────────────────────────
  return (
    <>
      <StatusBar hidden />
      <ReaderScreen
        pages={pages}
        initialPage={currentPage}
        mangaName={selectedManga?.name ?? ""}
        chapterLabel={`EP ${selectedChapter}`}
        mode={mode}
        onModeChange={(m) => {
          setMode(m);
          if (m !== "autoplay") setAutoPlay(false);
        }}
        autoPlay={autoPlay}
        onAutoPlay={setAutoPlay}
        autoPlaySpeed={autoPlaySpeed}
        onSpeedChange={setAutoPlaySpeed}
        onClose={handleBack}
        onPageChange={setCurrentPage}
      />
      <HiddenMangaModal
        visible={hideVisible}
        onClose={() => setHideVisible(false)}
      />
    </>
  );
}