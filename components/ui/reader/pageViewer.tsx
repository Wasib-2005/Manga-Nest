import React, { useRef, useCallback, useEffect, useState } from "react";
import {
  View, Image, ScrollView, FlatList,
  ActivityIndicator, Dimensions, Animated,
} from "react-native";

export type ViewMode = "horizontal" | "autoplay" | "vertical";

interface Props {
  pages:         string[];
  initialPage:   number;
  onPageChange:  (page: number) => void;
  mode:          ViewMode;
  autoPlay:      boolean;
  autoPlaySpeed: number; // seconds per page
}

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Single zoomable page (pinch = photo-app zoom) ────────────────────────────
// Named function inside React.memo fixes react/display-name eslint error
const ZoomPage = React.memo(function ZoomPage({ uri }: { uri: string }) {
  return (
    <ScrollView
      style={{ width: SW, height: SH }}
      contentContainerStyle={{ width: SW, height: SH }}
      maximumZoomScale={5}
      minimumZoomScale={1}
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      centerContent
      bouncesZoom
    >
      <Image
        source={{ uri: `file://${uri}` }}
        style={{ width: SW, height: SH }}
        resizeMode="contain"
      />
    </ScrollView>
  );
});

// ─── PageViewer ───────────────────────────────────────────────────────────────

export const PageViewer = ({
  pages,
  initialPage,
  onPageChange,
  mode,
  autoPlay,
  autoPlaySpeed,
}: Props) => {
  const flatRef      = useRef<FlatList>(null);
  const currentRef   = useRef(initialPage);
  const timerRef     = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Crossfade state (autoplay mode) ─────────────────────────────────────
  // Double-buffer: two image slots alternating so we never show a black frame
  const [crossPage,  setCrossPage]  = useState(initialPage);
  const crossPageRef                = useRef(initialPage);
  const [slot,       setSlot]       = useState<0 | 1>(0);
  const [slotPages,  setSlotPages]  = useState([initialPage, initialPage]);
  const opacityA     = useRef(new Animated.Value(1)).current; // slot 0
  const opacityB     = useRef(new Animated.Value(0)).current; // slot 1
  const opacities    = [opacityA, opacityB];
  const crossRunning = useRef(false);

  // ── Sync initialPage when the reader opens a new chapter ────────────────
  useEffect(() => {
    currentRef.current   = initialPage;
    crossPageRef.current = initialPage;
    setCrossPage(initialPage);
    setSlotPages([initialPage, initialPage]);
    opacityA.setValue(1);
    opacityB.setValue(0);
    setSlot(0);

    if (mode === "horizontal" && pages.length > 0) {
      setTimeout(() => {
        flatRef.current?.scrollToIndex({ index: Math.min(initialPage, pages.length - 1), animated: false });
      }, 80);
    }
  }, [pages.length, initialPage]);

  // ── Crossfade advance (used by both autoplay timer and manual) ───────────
  const crossfadeAdvance = useCallback(() => {
    if (crossRunning.current || pages.length === 0) return;
    crossRunning.current = true;

    const nextPage    = (crossPageRef.current + 1) % pages.length;
    const nextSlot    = slot === 0 ? 1 : 0;

    // Load the next image into the inactive slot first
    setSlotPages(prev => {
      const copy = [...prev] as [number, number];
      copy[nextSlot] = nextPage;
      return copy;
    });

    // Small delay lets React render the new image into the inactive slot
    setTimeout(() => {
      Animated.parallel([
        Animated.timing(opacities[slot],     { toValue: 0, duration: 450, useNativeDriver: true }),
        Animated.timing(opacities[nextSlot], { toValue: 1, duration: 450, useNativeDriver: true }),
      ]).start(() => {
        crossPageRef.current = nextPage;
        setCrossPage(nextPage);
        setSlot(nextSlot as 0 | 1);
        onPageChange(nextPage);
        crossRunning.current = false;
      });
    }, 60);
  }, [slot, pages.length, opacities, onPageChange]);

  // ── Autoplay timer ────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (!autoPlay || pages.length === 0) return;

    const ms = Math.max(300, autoPlaySpeed * 1000);

    if (mode === "autoplay") {
      // Crossfade mode: timer drives crossfadeAdvance
      timerRef.current = setInterval(crossfadeAdvance, ms);
    } else if (mode === "horizontal") {
      // Slide mode: timer scrolls FlatList
      timerRef.current = setInterval(() => {
        const next = (currentRef.current + 1) % pages.length;
        flatRef.current?.scrollToIndex({ index: next, animated: true });
        currentRef.current = next;
        onPageChange(next);
      }, ms);
    }
    // vertical + autoPlay: scroll down by one page height
    else if (mode === "vertical") {
      const vertRef = flatRef;
      timerRef.current = setInterval(() => {
        const next = (currentRef.current + 1) % pages.length;
        vertRef.current?.scrollToIndex({ index: next, animated: true });
        currentRef.current = next;
        onPageChange(next);
      }, ms);
    }

    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [autoPlay, autoPlaySpeed, mode, pages.length, crossfadeAdvance]);

  // ── Horizontal / Vertical FlatList helpers ────────────────────────────────
  const onMomentumEnd = useCallback((e: any) => {
    const offset = mode === "horizontal"
      ? e.nativeEvent.contentOffset.x
      : e.nativeEvent.contentOffset.y;
    const dim  = mode === "horizontal" ? SW : SH;
    const page = Math.round(offset / dim);
    if (page !== currentRef.current) {
      currentRef.current = page;
      onPageChange(page);
    }
  }, [mode, onPageChange]);

  const getItemLayout = useCallback((_: any, index: number) => {
    const dim = mode === "horizontal" ? SW : SH;
    return { length: dim, offset: dim * index, index };
  }, [mode]);

  const renderItem = useCallback(({ item }: { item: string }) => (
    <ZoomPage uri={item} />
  ), []);

  // ─────────────────────────────────────────────────────────────────────────

  if (pages.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "#030712", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#38D926" />
      </View>
    );
  }

  // ── Mode 2: Crossfade autoplay ────────────────────────────────────────────
  if (mode === "autoplay") {
    return (
      <View style={{ flex: 1, backgroundColor: "#030712" }}>
        {/* Slot 0 */}
        <Animated.View style={{ position: "absolute", inset: 0, opacity: opacityA }}>
          <Image
            source={{ uri: `file://${pages[slotPages[0]]}` }}
            style={{ width: SW, height: SH }}
            resizeMode="contain"
          />
        </Animated.View>
        {/* Slot 1 */}
        <Animated.View style={{ position: "absolute", inset: 0, opacity: opacityB }}>
          <Image
            source={{ uri: `file://${pages[slotPages[1]]}` }}
            style={{ width: SW, height: SH }}
            resizeMode="contain"
          />
        </Animated.View>
      </View>
    );
  }

  // ── Mode 1 & 3: Horizontal swipe or Vertical scroll ───────────────────────
  return (
    <FlatList
      ref={flatRef}
      data={pages}
      keyExtractor={(_, i) => String(i)}
      renderItem={renderItem}
      horizontal={mode === "horizontal"}
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
      getItemLayout={getItemLayout}
      initialScrollIndex={Math.min(initialPage, pages.length - 1)}
      onMomentumScrollEnd={onMomentumEnd}
      scrollEnabled={!autoPlay}
      removeClippedSubviews
      windowSize={5}
      maxToRenderPerBatch={3}
      initialNumToRender={3}
      style={{ backgroundColor: "#030712" }}
    />
  );
};