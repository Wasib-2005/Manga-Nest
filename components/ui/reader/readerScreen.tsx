/**
 * ReaderScreen.tsx
 *
 * Drop-in wrapper that:
 *   • Shows a translucent header + footer overlay
 *   • Auto-hides the UI after 3s of inactivity
 *   • Tapping the middle zone of a page re-shows the UI
 *   • Passes all necessary props down to PageViewer
 *
 * Usage:
 *   <ReaderScreen
 *     pages={pages}
 *     initialPage={savedPage}
 *     mode={mode}
 *     onModeChange={setMode}
 *     autoPlay={autoPlay}
 *     onAutoPlay={setAutoPlay}
 *     autoPlaySpeed={speed}
 *     onSpeedChange={setSpeed}
 *     mangaName="Chainsaw Man"
 *     chapterLabel="EP 42"
 *     onClose={() => navigation.goBack()}
 *     onPageChange={handlePageChange}
 *   />
 */

import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PageViewer, type ViewMode } from "./pageViewer";
import { SettingsModal } from "./settingsModal";

interface Props {
  pages: string[];
  initialPage?: number;
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  autoPlay: boolean;
  onAutoPlay: (v: boolean) => void;
  autoPlaySpeed: number;
  onSpeedChange: (v: number) => void;
  mangaName: string;
  chapterLabel: string;
  onClose: () => void;
  onPageChange?: (page: number) => void;
}

const AUTO_HIDE_DELAY = 3000; // ms

export const ReaderScreen = ({
  pages,
  initialPage = 0,
  mode,
  onModeChange,
  autoPlay,
  onAutoPlay,
  autoPlaySpeed,
  onSpeedChange,
  mangaName,
  chapterLabel,
  onClose,
  onPageChange,
}: Props) => {
  const insets = useSafeAreaInsets();
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [settingsVisible, setSettingsVisible] = useState(false);

  // UI visibility
  const uiVisible = useSharedValue(1);
  const [uiShown, setUiShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Animated styles for header + footer overlay
  const overlayStyle = useAnimatedStyle(() => ({
    opacity: withTiming(uiVisible.value, { duration: 250 }),
    pointerEvents: uiVisible.value > 0.5 ? "auto" : "none",
  }));

  const scheduleHide = useCallback(() => {
    if (hideTimer.current) clearTimeout(hideTimer.current);
    hideTimer.current = setTimeout(() => {
      uiVisible.value = 0;
      setUiShown(false);
    }, AUTO_HIDE_DELAY);
  }, []);

  const showUI = useCallback(() => {
    uiVisible.value = 1;
    setUiShown(true);
    scheduleHide();
  }, [scheduleHide]);

  const handleToggleUI = useCallback(() => {
    if (uiVisible.value > 0.5) {
      // Currently visible → hide immediately
      if (hideTimer.current) clearTimeout(hideTimer.current);
      uiVisible.value = 0;
      setUiShown(false);
    } else {
      showUI();
    }
  }, [showUI]);

  // Show UI on mount, then auto-hide
  useEffect(() => {
    showUI();
    return () => {
      if (hideTimer.current) clearTimeout(hideTimer.current);
    };
  }, []);

  const handlePageChange = useCallback(
    (idx: number) => {
      setCurrentPage(idx);
      onPageChange?.(idx);
    },
    [onPageChange]
  );

  const handleJumpToPage = useCallback(
    (page: number) => {
      setCurrentPage(page);
    },
    []
  );

  return (
    <View style={styles.root}>
      <StatusBar hidden />

      {/* ── Page content ─────────────────────────────────────────────────── */}
      <PageViewer
        pages={pages}
        initialPage={initialPage}
        onPageChange={handlePageChange}
        mode={mode}
        autoPlay={autoPlay}
        autoPlaySpeed={autoPlaySpeed}
        onToggleUI={handleToggleUI}
      />

      {/* ── Header overlay ───────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.header,
          { paddingTop: insets.top || (Platform.OS === "ios" ? 44 : 28) },
          overlayStyle,
        ]}
        pointerEvents={uiShown ? "auto" : "none"}
      >
        <TouchableOpacity onPress={onClose} style={styles.iconBtn}>
          <MaterialCommunityIcons name="arrow-left" size={20} color="#f1f5f9" />
        </TouchableOpacity>

        <View style={styles.titleBlock}>
          <Text style={styles.mangaName} numberOfLines={1}>
            {mangaName}
          </Text>
          <Text style={styles.chapterLabel}>{chapterLabel}</Text>
        </View>

        <TouchableOpacity
          onPress={() => setSettingsVisible(true)}
          style={styles.iconBtn}
        >
          <MaterialCommunityIcons name="tune-variant" size={20} color="#f1f5f9" />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Footer overlay ───────────────────────────────────────────────── */}
      <Animated.View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom || 16 },
          overlayStyle,
        ]}
        pointerEvents={uiShown ? "auto" : "none"}
      >
        {/* Progress bar */}
        <View style={styles.progressTrack}>
          <View
            style={[
              styles.progressFill,
              { width: `${((currentPage + 1) / pages.length) * 100}%` },
            ]}
          />
          {/* Thumb */}
          <View
            style={[
              styles.progressThumb,
              {
                left: `${((currentPage + 1) / pages.length) * 100}%`,
              },
            ]}
          />
        </View>

        {/* Page counter */}
        <Text style={styles.pageCounter}>
          {currentPage + 1}
          <Text style={styles.pageTotal}> / {pages.length}</Text>
        </Text>
      </Animated.View>

      {/* ── Settings modal ───────────────────────────────────────────────── */}
      <SettingsModal
        visible={settingsVisible}
        onClose={() => setSettingsVisible(false)}
        mode={mode}
        onModeChange={onModeChange}
        autoPlay={autoPlay}
        onAutoPlay={onAutoPlay}
        autoPlaySpeed={autoPlaySpeed}
        onSpeedChange={onSpeedChange}
        currentPage={currentPage}
        totalPages={pages.length}
        onJumpToPage={(p) => {
          handleJumpToPage(p);
          setSettingsVisible(false);
        }}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: "#000",
  },

  // ── Header
  header: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
    paddingBottom: 14,
    gap: 12,
    // Gradient-like fade using backgroundColor + blend
    backgroundColor: "rgba(0,0,0,0.72)",
    // iOS blur approximation
    ...(Platform.OS === "ios"
      ? {}
      : { borderBottomWidth: 1, borderBottomColor: "rgba(56,217,38,0.08)" }),
  },
  titleBlock: {
    flex: 1,
    alignItems: "center",
  },
  mangaName: {
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  chapterLabel: {
    color: "#38D926",
    fontSize: 11,
    fontWeight: "700",
    marginTop: 1,
  },
  iconBtn: {
    width: 38,
    height: 38,
    borderRadius: 12,
    backgroundColor: "rgba(255,255,255,0.08)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    justifyContent: "center",
    alignItems: "center",
  },

  // ── Footer
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingTop: 16,
    backgroundColor: "rgba(0,0,0,0.72)",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: "rgba(56,217,38,0.08)",
  },
  progressTrack: {
    width: "100%",
    height: 3,
    backgroundColor: "rgba(255,255,255,0.12)",
    borderRadius: 2,
    overflow: "visible",
    position: "relative",
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#38D926",
    borderRadius: 2,
    shadowColor: "#38D926",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 4,
  },
  progressThumb: {
    position: "absolute",
    top: -4,
    width: 10,
    height: 10,
    borderRadius: 5,
    backgroundColor: "#38D926",
    marginLeft: -5,
    shadowColor: "#38D926",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  pageCounter: {
    color: "#f1f5f9",
    fontSize: 13,
    fontWeight: "800",
  },
  pageTotal: {
    color: "#475569",
    fontWeight: "600",
  },
});