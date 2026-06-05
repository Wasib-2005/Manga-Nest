import React, { useState, useRef, useCallback, useEffect } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Platform,
  StatusBar,
  ScrollView,
} from "react-native";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
} from "react-native-reanimated";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { PageViewer, type ViewMode, type PageViewerHandle } from "./pageViewer";
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
  mangaUid: string;
  currentEp: any;
}

const AUTO_HIDE_DELAY = 3000;

// ── Page Box Progress Bar ─────────────────────────────────────────────────────

const PAGE_BOX_MAX = 40;
const DOT_MAX = 120;

const PageBoxBar = ({ current, total }: { current: number; total: number }) => {
  if (total <= 0) return null;
  const read = current + 1;

  // Numeric fallback for very long manga
  if (total > DOT_MAX) {
    return (
      <View style={pb.numericRow}>
        <Text style={pb.numericCurrent}>{read}</Text>
        <Text style={pb.numericSep}> / </Text>
        <Text style={pb.numericTotal}>{total}</Text>
      </View>
    );
  }

  // Segment mode for medium-length manga
  if (total > PAGE_BOX_MAX) {
    const SEG = 20;
    const segSize = total / SEG;
    const litSegs = Math.round(read / segSize);
    return (
      <View style={pb.wrapper}>
        <Text style={pb.sideLabel}>{read}</Text>
        <View style={pb.segRow}>
          {Array.from({ length: SEG }).map((_, i) => (
            <View
              key={i}
              style={[
                pb.seg,
                i < litSegs && pb.segLit,
                i === litSegs - 1 && pb.segCurrent,
              ]}
            />
          ))}
        </View>
        <Text style={pb.sideLabel}>{total}</Text>
      </View>
    );
  }

  // Individual box mode
  return (
    <View style={pb.wrapper}>
      <Text style={pb.sideLabel}>{read}</Text>
      <View style={pb.boxRow}>
        {Array.from({ length: total }).map((_, i) => (
          <View
            key={i}
            style={[
              pb.box,
              i < read && pb.boxLit,
              i === current && pb.boxCurrent,
            ]}
          />
        ))}
      </View>
      <Text style={pb.sideLabel}>{total}</Text>
    </View>
  );
};

const pb = StyleSheet.create({
  wrapper: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    width: "100%",
  },
  boxRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  box: {
    flex: 1,
    height: 10,
    borderRadius: 3,
    backgroundColor: "rgba(255,255,255,0.1)",
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.05)",
  },
  boxLit: {
    backgroundColor: "rgba(56,217,38,0.45)",
    borderColor: "rgba(56,217,38,0.3)",
  },
  boxCurrent: {
    backgroundColor: "#38D926",
    borderColor: "#38D926",
    shadowColor: "#38D926",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 4,
    elevation: 4,
  },
  segRow: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 2,
  },
  seg: {
    flex: 1,
    height: 8,
    borderRadius: 2,
    backgroundColor: "rgba(255,255,255,0.1)",
  },
  segLit: { backgroundColor: "rgba(56,217,38,0.45)" },
  segCurrent: {
    backgroundColor: "#38D926",
    shadowColor: "#38D926",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.9,
    shadowRadius: 3,
    elevation: 3,
  },
  sideLabel: {
    color: "rgba(255,255,255,0.35)",
    fontSize: 10,
    fontWeight: "700",
    minWidth: 22,
    textAlign: "center",
  },
  numericRow: {
    flexDirection: "row",
    alignItems: "baseline",
    justifyContent: "center",
    paddingVertical: 4,
  },
  numericCurrent: { color: "#38D926", fontSize: 20, fontWeight: "900" },
  numericSep: {
    color: "rgba(255,255,255,0.3)",
    fontSize: 14,
    fontWeight: "600",
  },
  numericTotal: {
    color: "rgba(255,255,255,0.4)",
    fontSize: 14,
    fontWeight: "600",
  },
});

// ── ReaderScreen ──────────────────────────────────────────────────────────────

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
  onClose,
  onPageChange,
  mangaUid,
  currentEp,
  chapterLabel
}: Props) => {
  const insets = useSafeAreaInsets();
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [settingsVisible, setSettingsVisible] = useState(false);

  // Ref to PageViewer so we can call jumpToPage imperatively
  const viewerRef = useRef<PageViewerHandle>(null);

  // Sync display page when a new chapter is opened
  useEffect(() => {
    setCurrentPage(initialPage);
  }, [initialPage, pages]);

  // UI overlay visibility
  const uiVisible = useSharedValue(1);
  const [uiShown, setUiShown] = useState(true);
  const hideTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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
      if (hideTimer.current) clearTimeout(hideTimer.current);
      uiVisible.value = 0;
      setUiShown(false);
    } else {
      showUI();
    }
  }, [showUI]);

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
    [onPageChange],
  );

  // ── This is the key fix: call the imperative jump on the viewer ──────────
  const handleJumpToPage = useCallback(
    (pageIndex: number) => {
      const clamped = Math.max(0, Math.min(pageIndex, pages.length - 1));
      viewerRef.current?.jumpToPage(clamped);
      setCurrentPage(clamped);
      onPageChange?.(clamped);
      setSettingsVisible(false);
    },
    [pages.length, onPageChange],
  );

  return (
    <View style={styles.root}>
      <StatusBar hidden />

      {/* ── Pages ── */}
      <PageViewer
        ref={viewerRef}
        pages={pages}
        initialPage={initialPage}
        onPageChange={handlePageChange}
        mode={mode}
        autoPlay={autoPlay}
        autoPlaySpeed={autoPlaySpeed}
        onToggleUI={handleToggleUI}
      />

      {/* ── Header overlay ── */}
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
          <MaterialCommunityIcons
            name="tune-variant"
            size={20}
            color="#f1f5f9"
          />
        </TouchableOpacity>
      </Animated.View>

      {/* ── Footer — page box bar ── */}
      <Animated.View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom ? insets.bottom + 4 : 20 },
          overlayStyle,
        ]}
        pointerEvents={uiShown ? "auto" : "none"}
      >
        <PageBoxBar current={currentPage} total={pages.length} />
      </Animated.View>
      {/* ── Settings modal ── */}
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
        onJumpToPage={handleJumpToPage}
        mangaUid={mangaUid}
        currentEp={currentEp}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: "#000" },
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
    backgroundColor: "rgba(0,0,0,0.72)",
    ...(Platform.OS === "ios"
      ? {}
      : { borderBottomWidth: 1, borderBottomColor: "rgba(56,217,38,0.08)" }),
  },
  titleBlock: { flex: 1, alignItems: "center" },
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
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    paddingHorizontal: 16,
    paddingTop: 14,
    backgroundColor: "rgba(0,0,0,0.72)",
    borderTopWidth: 1,
    borderTopColor: "rgba(56,217,38,0.08)",
  },
});
