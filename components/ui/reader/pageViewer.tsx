import React, { useRef, useCallback, useEffect, useState, useImperativeHandle, forwardRef } from "react";
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
  interpolate,
  Extrapolation,
  type SharedValue,
} from "react-native-reanimated";

export type ViewMode = "horizontal" | "autoplay" | "vertical";

// ── Imperative handle exposed to parent ───────────────────────────────────────
export interface PageViewerHandle {
  jumpToPage: (index: number) => void;
}

interface Props {
  pages: string[];
  initialPage: number;
  onPageChange: (page: number) => void;
  mode: ViewMode;
  autoPlay: boolean;
  autoPlaySpeed: number;
  onToggleUI?: () => void;
  onFinish?: () => void;
  pagePadding: number;
}

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Vertical page ────────────────────────────────────────────────────────────

const VerticalPage = React.memo(function VerticalPage({
  uri,
  index,
  onHeightChange,
  onZoomChange,
  hidden = false,
  pagePadding,
}: {
  uri: string;
  index: number;
  onHeightChange: (index: number, height: number) => void;
  onZoomChange: (index: number, zoomed: boolean) => void;
  hidden?: boolean;
  pagePadding: number;
}) {
  const contentWidth = SW - pagePadding * 2;
  const [imgHeight, setImgHeight] = useState(Math.round(contentWidth * (4 / 3)));
  const scale = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX = useSharedValue(0);
  const savedTY = useSharedValue(0);
  const focalX = useSharedValue(0);
  const focalY = useSharedValue(0);

  useEffect(() => {
    let cancelled = false;
    Image.getSize(
      `file://${uri}`,
      (w, h) => {
        if (!cancelled && w > 0 && h > 0) {
          const height = Math.round((contentWidth * h) / w);
          setImgHeight(height);
          onHeightChange(index, height + pagePadding * 2);
        }
      },
      () => {}
    );
    return () => { cancelled = true; };
  }, [contentWidth, index, onHeightChange, onZoomChange, uri]);

  const pinch = Gesture.Pinch()
    .onStart((event) => {
      focalX.value = event.focalX;
      focalY.value = event.focalY;
      runOnJS(onZoomChange)(index, true);
    })
    .onUpdate((event) => {
      const nextScale = clamp(savedScale.value * event.scale, 1, 4);
      const factor = nextScale / savedScale.value;
      scale.value = nextScale;
      translateX.value = focalX.value - factor * (focalX.value - savedTX.value);
      translateY.value = focalY.value - factor * (focalY.value - savedTY.value);
    })
    .onEnd(() => {
      if (scale.value <= 1.05) {
        scale.value = withTiming(1, { duration: 160 });
        translateX.value = withTiming(0, { duration: 160 });
        translateY.value = withTiming(0, { duration: 160 });
        savedScale.value = 1;
        savedTX.value = 0;
        savedTY.value = 0;
        runOnJS(onZoomChange)(index, false);
      } else {
        savedScale.value = scale.value;
        savedTX.value = translateX.value;
        savedTY.value = translateY.value;
      }
    });

  const pan = Gesture.Pan()
    .minPointers(1)
    .manualActivation(true)
    .onTouchesMove((_event, stateManager) => {
      if (savedScale.value > 1) {
        stateManager.activate();
      } else {
        stateManager.fail();
      }
    })
    .onUpdate((event) => {
      if (savedScale.value > 1) {
        translateX.value = savedTX.value + event.translationX;
        translateY.value = savedTY.value + event.translationY;
      }
    })
    .onEnd(() => {
      if (savedScale.value > 1) {
        savedTX.value = translateX.value;
        savedTY.value = translateY.value;
      }
    });

  const zoomStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  return (
    <GestureDetector gesture={Gesture.Simultaneous(pinch, pan)}>
      <Animated.View
        pointerEvents={hidden ? "none" : "auto"}
        style={[
          {
            width: SW,
            height: imgHeight + pagePadding * 2,
            padding: pagePadding,
            backgroundColor: "#000",
            overflow: "visible",
          },
          hidden && { opacity: 0 },
          zoomStyle,
        ]}
      >
        <Image
          source={{ uri: `file://${uri}` }}
          style={{ width: contentWidth, height: imgHeight, backgroundColor: "#000" }}
          resizeMode="stretch"
          resizeMethod="resize"
          fadeDuration={0}
        />
      </Animated.View>
    </GestureDetector>
  );
});

// ─── Vertical viewer ──────────────────────────────────────────────────────────

interface VerticalViewerProps {
  pages: string[];
  initialPage: number;
  onPageChange: (page: number) => void;
  onToggleUI: () => void;
  // expose jump to parent
  onRegisterJump: (fn: (idx: number) => void) => void;
  pagePadding: number;
}

const VerticalViewer = React.memo(function VerticalViewer({
  pages,
  initialPage,
  onPageChange,
  onToggleUI,
  onRegisterJump,
  pagePadding,
}: VerticalViewerProps) {
  const scrollRef  = useRef<ScrollView>(null);
  const contentWidth = SW - pagePadding * 2;
  const heightsRef = useRef<number[]>(Array(pages.length).fill(Math.round(contentWidth * (4 / 3) + pagePadding * 2)));
  const didJump    = useRef(false);
  const lastPageRef = useRef(-1);
  const [zoomedPage, setZoomedPage] = useState<number | null>(null);

  const handleHeightChange = useCallback((index: number, height: number) => {
    heightsRef.current[index] = height;
  }, []);
  const handleZoomChange = useCallback((index: number, zoomed: boolean) => {
    setZoomedPage(zoomed ? index : null);
  }, []);

  const scrollToPage = useCallback((page: number) => {
    if (page <= 0) { scrollRef.current?.scrollTo({ y: 0, animated: false }); return; }
    const offset = heightsRef.current.slice(0, page).reduce((a, b) => a + b, 0);
    scrollRef.current?.scrollTo({ y: offset, animated: true });
  }, []);

  // Register jump fn with parent
  useEffect(() => { onRegisterJump(scrollToPage); }, [scrollToPage, onRegisterJump]);

  useEffect(() => {
    if (!didJump.current && initialPage > 0) {
      const t = setTimeout(() => { scrollToPage(initialPage); didJump.current = true; }, 150);
      return () => clearTimeout(t);
    }
  }, [initialPage, scrollToPage]);

  const handleScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      const y = e.nativeEvent.contentOffset.y;
      let cumulative = 0;
      for (let i = 0; i < heightsRef.current.length; i++) {
        cumulative += heightsRef.current[i];
        if (y < cumulative) {
          if (lastPageRef.current !== i) {
            lastPageRef.current = i;
            onPageChange(i);
          }
          return;
        }
      }
      const lastPage = pages.length - 1;
      if (lastPageRef.current !== lastPage) {
        lastPageRef.current = lastPage;
        onPageChange(lastPage);
      }
    },
    [onPageChange, pages.length]
  );

  const tap = Gesture.Tap()
    .maxDuration(250)
    .maxDistance(12)
    .onEnd((e) => {
      runOnJS(onToggleUI)();
    });

  return (
    <GestureDetector gesture={tap}>
      <ScrollView
        ref={scrollRef}
        style={{ flex: 1, backgroundColor: "#000" }}
        scrollEventThrottle={16}
        onScroll={handleScroll}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
        scrollEnabled={zoomedPage === null}
        removeClippedSubviews
        decelerationRate="normal"
        overScrollMode="never"
        directionalLockEnabled
        contentContainerStyle={{ alignItems: "center" }}
      >
        {pages.map((uri, i) => (
          <VerticalPage
            key={`${i}-${uri}`}
            uri={uri}
            index={i}
            onHeightChange={handleHeightChange}
            onZoomChange={handleZoomChange}
            hidden={zoomedPage !== null && zoomedPage !== i}
            pagePadding={pagePadding}
          />
        ))}
      </ScrollView>
    </GestureDetector>
  );
});

// ─── Zoomable horizontal page ─────────────────────────────────────────────────

const ZoomPage = React.memo(function ZoomPage({
  uri, index, scrollX, cinematic, onNext, onPrev, onToggleUI, pagePadding,
}: {
  uri: string;
  index: number;
  scrollX: SharedValue<number>;
  cinematic: boolean;
  onNext: () => void;
  onPrev: () => void;
  onToggleUI: () => void;
  pagePadding: number;
}) {
  const scale      = useSharedValue(1);
  const savedScale = useSharedValue(1);
  const focalX     = useSharedValue(0);
  const focalY     = useSharedValue(0);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedTX    = useSharedValue(0);
  const savedTY    = useSharedValue(0);
  const isZoomed   = useSharedValue(false);

  const resetZoom = () => {
    "worklet";
    scale.value      = withTiming(1, { duration: 220 });
    translateX.value = withTiming(0, { duration: 220 });
    translateY.value = withTiming(0, { duration: 220 });
    savedScale.value = 1;
    savedTX.value    = 0;
    savedTY.value    = 0;
    isZoomed.value   = false;
  };

  const pinch = Gesture.Pinch()
    .onStart((e) => { focalX.value = e.focalX; focalY.value = e.focalY; })
    .onUpdate((e) => {
      const next  = clamp(savedScale.value * e.scale, 1, 6);
      const delta = next / savedScale.value;
      scale.value      = next;
      translateX.value = focalX.value - delta * (focalX.value - savedTX.value);
      translateY.value = focalY.value - delta * (focalY.value - savedTY.value);
    })
    .onEnd(() => {
      if (scale.value <= 1.05) { resetZoom(); }
      else {
        savedScale.value = scale.value;
        savedTX.value    = translateX.value;
        savedTY.value    = translateY.value;
        isZoomed.value   = true;
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
      if (isZoomed.value) { resetZoom(); }
      else {
        const ts = 2.5;
        const tx = (SW / 2 - e.x) * (ts - 1);
        const ty = (SH / 2 - e.y) * (ts - 1);
        scale.value      = withTiming(ts, { duration: 220 });
        translateX.value = withTiming(tx, { duration: 220 });
        translateY.value = withTiming(ty, { duration: 220 });
        savedScale.value = ts;
        savedTX.value    = tx;
        savedTY.value    = ty;
        isZoomed.value   = true;
      }
    });

  const singleTap = Gesture.Tap()
    .maxDuration(250)
    .onEnd((e) => {
      if (isZoomed.value) return;
      if (e.x < SW * 0.28)      runOnJS(onPrev)();
      else if (e.x > SW * 0.72) runOnJS(onNext)();
      else                       runOnJS(onToggleUI)();
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
  const slideshowStyle = useAnimatedStyle(() => {
    if (!cinematic) return { opacity: 1 };
    const distance = Math.abs(scrollX.value / SW - index);
    return {
      opacity: interpolate(distance, [0, 1], [1, 0.42], Extrapolation.CLAMP),
    };
  });

  return (
    <GestureDetector gesture={composed}>
      <Animated.View
        style={[
          {
            width: SW,
            height: SH,
            padding: pagePadding,
            justifyContent: "center",
            alignItems: "center",
            backgroundColor: "#000",
          },
          animStyle,
          slideshowStyle,
        ]}
      >
        <Image
          source={{ uri: `file://${uri}` }}
          style={{ width: SW - pagePadding * 2, height: SH - pagePadding * 2 }}
          resizeMode="contain"
        />
      </Animated.View>
    </GestureDetector>
  );
});

// ─── Tap hint ─────────────────────────────────────────────────────────────────

const TapHint = React.memo(function TapHint() {
  const [visible, setVisible] = useState(true);
  const opacity = useSharedValue(1);

  useEffect(() => {
    const t = setTimeout(() => {
      opacity.value = withTiming(0, { duration: 600 }, () => { runOnJS(setVisible)(false); });
    }, 1800);
    return () => clearTimeout(t);
  }, []);

  const style = useAnimatedStyle(() => ({ opacity: opacity.value }));
  if (!visible) return null;

  return (
    <Animated.View
      pointerEvents="none"
      style={[{ position: "absolute", bottom: 90, left: 0, right: 0, flexDirection: "row", paddingHorizontal: 20 }, style]}
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

const AutoPlayViewer = React.memo(function AutoPlayViewer({
  pages,
  initialPage,
  autoPlay,
  autoPlaySpeed,
  pagePadding,
  onPageChange,
  onToggleUI,
  onFinish,
  onRegisterJump,
}: {
  pages: string[];
  initialPage: number;
  autoPlay: boolean;
  autoPlaySpeed: number;
  pagePadding: number;
  onPageChange: (page: number) => void;
  onToggleUI: () => void;
  onFinish?: () => void;
  onRegisterJump: (fn: (index: number) => void) => void;
}) {
  const [page, setPage] = useState(initialPage);
  const opacity = useSharedValue(1);

  const showPage = useCallback((nextPage: number) => {
    const next = Math.max(0, Math.min(nextPage, pages.length - 1));
    if (next === page) return;
    opacity.value = 0;
    setPage(next);
    onPageChange(next);
    opacity.value = withTiming(1, { duration: 420 });
  }, [onPageChange, opacity, page, pages.length]);

  useEffect(() => {
    onRegisterJump(showPage);
  }, [onRegisterJump, showPage]);

  useEffect(() => {
    if (!autoPlay) return;
    const timer = setInterval(() => {
      if (page >= pages.length - 1) {
        onFinish?.();
      } else {
        showPage(page + 1);
      }
    }, autoPlaySpeed * 1000);
    return () => clearInterval(timer);
  }, [autoPlay, autoPlaySpeed, onFinish, page, pages.length, showPage]);

  const fadeStyle = useAnimatedStyle(() => ({ opacity: opacity.value }));
  const tap = Gesture.Tap().onEnd((event) => {
    if (event.x < SW * 0.28) runOnJS(showPage)(page - 1);
    else if (event.x > SW * 0.72) runOnJS(showPage)(page + 1);
    else runOnJS(onToggleUI)();
  });

  return (
    <GestureDetector gesture={tap}>
      <Animated.View style={{ flex: 1, backgroundColor: "#000" }}>
        <Animated.Image
          source={{ uri: `file://${pages[page]}` }}
          resizeMode="contain"
          style={[
            { width: SW, height: SH, padding: pagePadding },
            fadeStyle,
          ]}
        />
      </Animated.View>
    </GestureDetector>
  );
});

// ─── Main PageViewer ──────────────────────────────────────────────────────────

export const PageViewer = forwardRef<PageViewerHandle, Props>(function PageViewer(
  { pages, initialPage, onPageChange, mode, autoPlay, autoPlaySpeed, onToggleUI, onFinish, pagePadding },
  ref
) {
  const flatRef         = useRef<FlatList<string>>(null);
  const scrollX = useSharedValue(initialPage * SW);
  const currentIndexRef = useRef(initialPage);
  // For vertical mode, we store a jump fn registered by VerticalViewer
  const verticalJumpRef = useRef<((idx: number) => void) | null>(null);
  const autoplayJumpRef = useRef<((idx: number) => void) | null>(null);

  const handleToggleUI = useCallback(() => onToggleUI?.(), [onToggleUI]);

  // ── jumpToPage — works for both horizontal and vertical ───────────────────
  const jumpToPage = useCallback((index: number) => {
    const clamped = Math.max(0, Math.min(index, pages.length - 1));
    if (mode === "vertical") {
      verticalJumpRef.current?.(clamped);
      onPageChange(clamped);
    } else if (mode === "autoplay") {
      autoplayJumpRef.current?.(clamped);
    } else {
      flatRef.current?.scrollToIndex({ index: clamped, animated: true });
    }
  }, [mode, pages.length, onPageChange]);

  // Expose jumpToPage to parent via ref
  useImperativeHandle(ref, () => ({ jumpToPage }), [jumpToPage]);

  const goToNext = useCallback(() => {
    const next = currentIndexRef.current + 1;
    if (next < pages.length) {
      flatRef.current?.scrollToIndex({ index: next, animated: true });
    } else {
      onFinish?.();
    }
  }, [pages.length, onFinish]);

  const goToPrev = useCallback(() => {
    const prev = currentIndexRef.current - 1;
    if (prev >= 0) flatRef.current?.scrollToIndex({ index: prev, animated: true });
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
  const onHorizontalScroll = useCallback(
    (event: { nativeEvent: { contentOffset: { x: number } } }) => {
      scrollX.value = event.nativeEvent.contentOffset.x;
    },
    [scrollX],
  );

  // Autoplay
  useEffect(() => {
    if (!autoPlay || mode !== "autoplay") return;
    const id = setInterval(goToNext, autoPlaySpeed * 1000);
    return () => clearInterval(id);
  }, [autoPlay, autoPlaySpeed, mode, goToNext]);

  // Sync initial page for horizontal/autoplay
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

  // ── Vertical ──────────────────────────────────────────────────────────────
  if (mode === "vertical") {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <VerticalViewer
          pages={pages}
          initialPage={initialPage}
          onPageChange={onPageChange}
          onToggleUI={handleToggleUI}
          onRegisterJump={(fn) => { verticalJumpRef.current = fn; }}
          pagePadding={pagePadding}
        />
      </GestureHandlerRootView>
    );
  }

  if (mode === "autoplay") {
    return (
      <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
        <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
        <AutoPlayViewer
          pages={pages}
          initialPage={initialPage}
          autoPlay={autoPlay}
          autoPlaySpeed={autoPlaySpeed}
          pagePadding={pagePadding}
          onPageChange={onPageChange}
          onToggleUI={handleToggleUI}
          onFinish={onFinish}
          onRegisterJump={(fn) => { autoplayJumpRef.current = fn; }}
        />
      </GestureHandlerRootView>
    );
  }

  // ── Horizontal swipe ────────────────────────────────────────────────────────
  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000", padding: 3 }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        ref={flatRef}
        data={pages}
        keyExtractor={(_, i) => String(i)}
        renderItem={({ item, index }: ListRenderItemInfo<string>) => (
          <ZoomPage
            uri={item}
            index={index}
            scrollX={scrollX}
            cinematic={false}
            onNext={goToNext}
            onPrev={goToPrev}
            onToggleUI={handleToggleUI}
            pagePadding={pagePadding}
          />
        )}
        horizontal
        pagingEnabled
        scrollEnabled={!autoPlay}
        showsHorizontalScrollIndicator={false}
        onViewableItemsChanged={onViewableItemsChanged}
        onScroll={onHorizontalScroll}
        scrollEventThrottle={16}
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
});