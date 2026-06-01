import React, { useRef, useCallback, useEffect, useState } from "react";
import {
  View,
  Image,
  FlatList,
  ScrollView,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  ViewToken,
  ListRenderItemInfo,
  Text,
} from "react-native";

import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from "react-native-gesture-handler";
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  runOnJS,
  clamp,
} from "react-native-reanimated";

export type ViewMode = "horizontal" | "autoplay" | "vertical";

interface Props {
  pages: string[];
  initialPage: number;
  onPageChange: (page: number) => void;
  mode: ViewMode;
  autoPlay: boolean;
  autoPlaySpeed: number;
  onToggleUI?: () => void;
}

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Vertical scroll mode ─────────────────────────────────────────────────────
// Uses a plain ScrollView — no FlatList, no getItemLayout headaches.
// Each image sizes itself after Image.getSize resolves; a placeholder keeps
// layout stable while loading.

interface VerticalPageProps {
  uri: string;
}

const VerticalPage = React.memo(function VerticalPage({ uri }: VerticalPageProps) {
  // Start with a 4:3 guess so the list isn't zero-height before images resolve
  const [imgHeight, setImgHeight] = useState(Math.round(SW * (4 / 3)));

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      `file://${uri}`,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) {
          setImgHeight(Math.round((SW * h) / w));
        }
      },
      () => {} // silently keep the placeholder height on error
    );
    return () => { cancelled = true; };
  }, [uri]);

  return (
    <Image
      source={{ uri: `file://${uri}` }}
      style={{
        width: SW,          // full width — no padding conflict
        height: imgHeight,
        backgroundColor: "#000",
      }}
      resizeMode="contain"
    />
  );
});

// ─── Vertical viewer (ScrollView-based) ──────────────────────────────────────

interface VerticalViewerProps {
  pages: string[];
  initialPage: number;
  onPageChange: (page: number) => void;
  onToggleUI: () => void;
}

const VerticalViewer = React.memo(function VerticalViewer({
  pages,
  initialPage,
  onPageChange,
  onToggleUI,
}: VerticalViewerProps) {
  const scrollRef = useRef<ScrollView>(null);
  // Track cumulative offsets so we can report page changes
  const offsetsRef = useRef<number[]>(Array(pages.length).fill(0));
  const heightsRef = useRef<number[]>(Array(pages.length).fill(Math.round(SW * (4 / 3))));
  const didJump = useRef(false);

  // Once all heights are estimated, jump to initialPage
  const jumpToPage = useCallback((page: number) => {
    if (page <= 0) return;
    const offset = heightsRef.current.slice(0, page).reduce((a, b) => a + b, 0);
    scrollRef.current?.scrollTo({ y: offset, animated: false });
  }, []);

  useEffect(() => {
    if (!didJump.current && initialPage > 0) {
      // Wait a tick for the layout to be ready
      const t = setTimeout(() => {
        jumpToPage(initialPage);
        didJump.current = true;
      }, 150);
      return () => clearTimeout(t);
    }
  }, [initialPage, jumpToPage]);

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      // Find which page the top of the viewport is in
      let cumulative = 0;
      for (let i = 0; i < heightsRef.current.length; i++) {
        cumulative += heightsRef.current[i];
        if (y < cumulative) {
          onPageChange(i);
          return;
        }
      }
      onPageChange(pages.length - 1);
    },
    [onPageChange, pages.length]
  );

  // Middle-tap toggle UI
  const tap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      if (e.x > SW * 0.25 && e.x < SW * 0.75) {
        runOnJS(onToggleUI)();
      }
    });

  return (
    <GestureDetector gesture={tap}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: "#000" }}
        scrollEventThrottle={100}
        onScroll={handleScroll}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={{ alignItems: "center" }}
      >
        {pages.map((uri, i) => (
          <VerticalPage
            key={`${i}-${uri}`}
            uri={uri}
          />
        ))}
      </ScrollView>
    </GestureDetector>
  );
});

// ─── Zoomable horizontal page ─────────────────────────────────────────────────

interface ZoomPageProps {
  uri: string;
  onNext: () => void;
  onPrev: () => void;
  onToggleUI: () => void;
}

const ZoomPage = React.memo(function ZoomPage({
  uri,
  onNext,
  onPrev,
  onToggleUI,
}: ZoomPageProps) {
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);
  const isZoomed = useSharedValue(false);

  const resetZoom = () => {
    "worklet";
    scale.value = withTiming(1, { duration: 220 });
    translateX.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(0, { duration: 220 });
    savedScale.value = 1;
    savedTX.value = 0;
    savedTY.value = 0;
    isZoomed.value = false;
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => {
      focalX.value = e.focalX;
      focalY.value = e.focalY;
    })
    .onUpdate((e) => {
      const next = clamp(savedScale.value * e.scale, 1, 6);
      scale.value = next;
      const delta = next / savedScale.value;
      translateX.value = focalX.value - delta * (focalX.value - savedTX.value);
      translateY.value = focalY.value - delta * (focalY.value - savedTY.value);
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        resetZoom();
      } else {
        savedScale.value = scale.value;
        savedTX.value = translateX.value;
        savedTY.value = translateY.value;
        isZoomed.value = true;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .onUpdate((e) => {
      if (isZoomed.value) {
        translateX.value = savedTX.value + e.translationX;
        translateY.value = savedTY.value + e.translationY;
      }
    })
    .onEnd(() => {
      if (isZoomed.value) {
        savedTX.value = translateX.value;
        savedTY.value = translateY.value;
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .maxDuration(300)
    .onEnd((e) => {
      if (isZoomed.value) {
        resetZoom();
      } else {
        const targetScale = 2.5;
        const tx = (SW / 2 - e.x) * (targetScale - 1);
        const ty = (SH / 2 - e.y) * (targetScale - 1);
        scale.value = withTiming(targetScale, { duration: 220 });
        translateX.value = withTiming(tx, { duration: 220 });
        translateY.value = withTiming(ty, { duration: 220 });
        savedScale.value = targetScale;
        savedTX.value = tx;
        savedTY.value = ty;
        isZoomed.value = true;
      }
    });

  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      if (isZoomed.value) return;
      if (e.x < SW * 0.28) runOnJS(onPrev)();
      else if (e.x > SW * 0.72) runOnJS(onNext)();
      else runOnJS(onToggleUI)();
    });

  const composed = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTap, singleTap),
    pinch,
    pan
  );

  const animStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          { width: SW, height: SH, justifyContent: "center", alignItems: "center", backgroundColor: "#000" },
          animStyle,
        ]}
      >
        <Image
          source={{ uri: `file://${uri}` }}
          style={{ width: SW - 4, height: SH - 4 }}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
});

// ─── Tap-zone hint ────────────────────────────────────────────────────────────

const TapHint = React.memo(function TapHint() {
  const [visible, setVisible] = useState(true);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const t = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 600 }, () => {
        runOnJS(setVisible)(false);
      });
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[
        { position: "absolute", bottom: 90, left: 0, right: 0, flexDirection: "row", paddingHorizontal: 20 },
        style,
      ]}
    >
      {[
        { label: "← Prev", align: "flex-start" as const },
        { label: "Menu",   align: "center"     as const },
        { label: "Next →", align: "flex-end"   as const },
      ].map(({ label, align }) => (
        <View key={label} style={{ flex: 1, alignItems: align }}>
          <View style={{ backgroundColor: "rgba(0,0,0,0.65)", borderRadius: 8, paddingHorizontal: 10, paddingVertical: 5, borderWidth: 1, borderColor: "rgba(56,217,38,0.3)" }}>
            <Text style={{ color: "rgba(255,255,255,0.6)", fontSize: 11 }}>{label}</Text>
          </View>
        </View>
      ))}
    </Animated.View>
  );
});

// ─── Main PageViewer ──────────────────────────────────────────────────────────

export const PageViewer = ({
  pages,
  initialPage,
  onPageChange,
  mode,
  autoPlay,
  autoPlaySpeed,
  onToggleUI,
}: Props) => {
  const flatRef = useRef<FlatList<string>>(null);
  const currentIndexRef = useRef(initialPage);

  const handleToggleUI = useCallback(() => onToggleUI?.(), [onToggleUI]);

  const goToNext = useCallback(() => {
    const next = currentIndexRef.current + 1;
    if (next < pages.length)
      flatRef.current?.scrollToIndex({ index: next, animated: true });
  }, [pages.length]);

  const goToPrev = useCallback(() => {
    const prev = currentIndexRef.current - 1;
    if (prev >= 0)
      flatRef.current?.scrollToIndex({ index: prev, animated: true });
  }, []);

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      if (viewableItems?.[0]) {
        const idx = viewableItems[0].index ?? 0;
        currentIndexRef.current = idx;
        onPageChange(idx);
      }
    },
    [onPageChange]
  );
  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  // Autoplay
  useEffect(() => {
    if (!autoPlay || mode !== "autoplay") return;
    const id = setInterval(goToNext, autoPlaySpeed * 1000);
    return () => clearInterval(id);
  }, [autoPlay, autoPlaySpeed, mode, goToNext]);

  // Jump to initial page (horizontal/autoplay only — vertical handles it internally)
  useEffect(() => {
    if (mode === "vertical") return;
    currentIndexRef.current = initialPage;
    const t = setTimeout(() => {
      flatRef.current?.scrollToIndex({ index: initialPage, animated: false });
    }, 300);
    return () => clearTimeout(t);
  }, [mode, initialPage]);

  if (pages.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center", alignItems: "center" }}>
        <ActivityIndicator size="large" color="#38D926" />
      </View>
    );
  }

  // ── Vertical mode: dedicated ScrollView component ─────────────────────────
  if (mode === "vertical") {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <VerticalViewer
          pages={pages}
          initialPage={initialPage}
          onPageChange={onPageChange}
          onToggleUI={handleToggleUI}
        />
      </GestureHandlerRootView>
    );
  }

  // ── Horizontal / autoplay: FlatList with paging ───────────────────────────
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000", padding:3 }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        ref={flatRef}
        data={pages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item }: ListRenderItemInfo<string>) => (
          <ZoomPage
            uri={item}
            onNext={goToNext}
            onPrev={goToPrev}
            onToggleUI={handleToggleUI}
          />
        )}
        horizontal
        pagingEnabled
        scrollEnabled={!autoPlay}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={(_, i) => ({ length: SW, offset: SW * i, index: i })}
        onScrollToIndexFailed={(info) => {
          flatRef.current?.scrollToOffset({
            offset: info.averageItemLength * info.index,
            animated: false,
          });
        }}
      />
      <TapHint />
    </GestureHandlerRootView>
  );
};