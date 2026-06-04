import React, { useState, useRef, useCallback } from "react";
import {
  View,
  StatusBar,
  BackHandler,
  Alert,
} from "react-native";
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
import { useEffect } from "react";
import type { ViewMode } from "../../components/ui/reader/pageViewer";

type Screen = "library" | "reader";

export default function Index() {
  const [screen, setScreen] = useState<Screen>("library");
  const [selectedManga, setSelectedManga] = useState<MangaEntry | null>(null);
  const [selectedChapter, setSelectedChapter] = useState("");
  const [pages, setPages] = useState<string[]>([]);
  const [initialPage, setInitialPage] = useState(0);
  const [currentPage, setCurrentPage] = useState(0);
  const [mode, setMode] = useState<ViewMode>("horizontal");
  const [autoPlay, setAutoPlay] = useState(false);
  const [autoPlaySpeed, setAutoPlaySpeed] = useState(2);
  const [hideVisible, setHideVisible] = useState(false);
  const [nestTaps, setNestTaps] = useState(0);

  // Library refresh signal — only increments on actual data changes (delete/rename)
  // NOT on back navigation, so the library keeps its scroll position & page
  const [libraryRefreshKey, setLibraryRefreshKey] = useState(0);

  const currentPageRef = useRef(0);

  // ── Hidden manga easter egg ───────────────────────────────────────────────
  const handleNestTap = () => {
    const next = nestTaps + 1;
    setNestTaps(next);
    if (next >= 5) {
      setNestTaps(0);
      setHideVisible(true);
    }
  };

  // ── Open a chapter ────────────────────────────────────────────────────────
  const handleSelectManga = useCallback(async (manga: MangaEntry, chapter: string) => {
    try {
      const [chapterPages, lastPage] = await Promise.all([
        getChapterPages(manga.uid, chapter),
        getReadingProgress(manga.uid, chapter),
      ]);

      const startPage = Math.min(lastPage, Math.max(0, chapterPages.length - 1));

      setSelectedManga(manga);
      setSelectedChapter(chapter);
      setPages(chapterPages);
      setInitialPage(startPage);
      setCurrentPage(startPage);
      currentPageRef.current = startPage;
      setAutoPlay(false);
      setScreen("reader");
    } catch (err) {
      Alert.alert("Error", "Failed to load chapter");
      console.error(err);
    }
  }, []);

  // ── Save progress on every page turn ─────────────────────────────────────
  const handlePageChange = useCallback((page: number) => {
    currentPageRef.current = page;
    setCurrentPage(page);

    if (selectedManga && selectedChapter) {
      saveReadingProgress(
        selectedManga.uid,
        selectedChapter,
        page,
        pages.length
      );
    }
  }, [selectedManga, selectedChapter, pages.length]);

  // ── Back from reader → stay on library exactly where it was ──────────────
  const handleBack = useCallback(() => {
    // Save final page position
    if (selectedManga && selectedChapter) {
      saveReadingProgress(
        selectedManga.uid,
        selectedChapter,
        currentPageRef.current,
        pages.length
      );
    }
    // Just hide the reader — do NOT remount LibraryScreen
    setScreen("library");
    setNestTaps(0);
    setAutoPlay(false);
    // Note: we do NOT clear selectedManga/chapter/pages here
    // so if user reopens same chapter it's instant
  }, [selectedManga, selectedChapter, pages.length]);

  // ── Deletion (these DO need a library refresh) ────────────────────────────
  const onDeleteChapter = useCallback(async (uid: string, ep: string) => {
    try {
      const wasFullMangaDeleted = await deleteChapterFiles(uid, ep);
      if (wasFullMangaDeleted && selectedManga?.uid === uid) {
        setScreen("library");
        setSelectedManga(null);
      }
      setLibraryRefreshKey((prev) => prev + 1);
    } catch {
      Alert.alert("Error", "Failed to delete chapter");
    }
  }, [selectedManga]);

  const onDeleteManga = useCallback(async (uid: string) => {
    try {
      await deleteFullManga(uid);
      if (selectedManga?.uid === uid) {
        setScreen("library");
        setSelectedManga(null);
      }
      setLibraryRefreshKey((prev) => prev + 1);
    } catch {
      Alert.alert("Error", "Failed to delete manga from library");
    }
  }, [selectedManga]);

  const onRenameChapter = useCallback(async (uid: string, oldEp: string, newEp: string) => {
    try {
      await renameChapterEp(uid, oldEp, newEp);
      if (selectedManga?.uid === uid && selectedChapter === oldEp) {
        setSelectedChapter(newEp);
      }
      setLibraryRefreshKey((prev) => prev + 1);
    } catch {
      Alert.alert("Error", "Failed to rename chapter");
    }
  }, [selectedManga, selectedChapter]);

  // ── Hardware back button ──────────────────────────────────────────────────
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
  }, [screen, handleBack]);

  return (
    <View style={{ flex: 1 }}>
      {/* ── Library (always mounted, just hidden when reading) ── */}
      <View style={{ flex: 1, display: screen === "library" ? "flex" : "none" }}>
        <StatusBar barStyle="light-content" backgroundColor="#030712" />
        <LibraryScreen
          key={libraryRefreshKey}
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

      {/* ── Reader (mounted only when we have pages) ── */}
      {screen === "reader" && pages.length > 0 && (
        <>
          <StatusBar hidden />
          <ReaderScreen
            pages={pages}
            initialPage={initialPage}
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
            onPageChange={handlePageChange}
          />
          <HiddenMangaModal
            visible={hideVisible}
            onClose={() => setHideVisible(false)}
          />
        </>
      )}
    </View>
  );
}