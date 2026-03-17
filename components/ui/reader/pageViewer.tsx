import React, { useRef, useCallback, useEffect, useState } from "react";
import {
  View,
  Image,
  FlatList,
  ActivityIndicator,
  Dimensions,
  StatusBar,
  ViewToken,
  ListRenderItemInfo,
} from "react-native";

import { Gesture, GestureDetector, GestureHandlerRootView } from 'react-native-gesture-handler';
import Animated, { 
  useSharedValue, 
  useAnimatedStyle, 
  withTiming, 
  runOnJS 
} from 'react-native-reanimated';

export type ViewMode = "horizontal" | "autoplay" | "vertical";

interface Props {
  pages: string[];
  initialPage: number;
  onPageChange: (page: number) => void;
  mode: ViewMode;
  autoPlay: boolean;
  autoPlaySpeed: number;
}

const { width: SW, height: SH } = Dimensions.get("window");

// ─── Vertical Page Component ──────────────────────────────────────────
const VerticalPage = React.memo(function VerticalPage({
  uri,
  onLayout,
}: {
  uri: string;
  onLayout: (h: number) => void;
}) {
  const [aspectRatio, setAspectRatio] = useState(1);

  useEffect(() => {
    Image.getSize(`file://${uri}`, (w, h) => {
      if (w && h) {
        const ratio = w / h;
        setAspectRatio(ratio);
        onLayout(SW / ratio);
      }
    }, () => {});
  }, [uri, onLayout]);

  return (
    <Image
      source={{ uri: `file://${uri}` }}
      style={{
        width: SW,
        height: SW / aspectRatio,
        backgroundColor: "#000",
      }}
      resizeMode="contain"
    />
  );
});

// ─── Zoomable Page Component ──────────────────────────────────────────
const ZoomPage = React.memo(function ZoomPage({ 
  uri, 
  onZoomToggle,
  onNext,
  onPrev 
}: { 
  uri: string; 
  onZoomToggle: (isZoomed: boolean) => void;
  onNext: () => void;
  onPrev: () => void;
}) {
  const scale = useSharedValue(1);
  const translateX = useSharedValue(0);
  const translateY = useSharedValue(0);
  const savedScale = useSharedValue(1);
  const savedTranslateX = useSharedValue(0);
  const savedTranslateY = useSharedValue(0);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateX: translateX.value },
      { translateY: translateY.value },
      { scale: scale.value },
    ],
  }));

  const tapGesture = Gesture.Tap()
    .onEnd((e) => {
      if (scale.value <= 1.1) {
        if (e.x > SW * 0.7) runOnJS(onNext)();
        else if (e.x < SW * 0.3) runOnJS(onPrev)();
      }
    });

  const doubleTap = Gesture.Tap()
    .numberOfTaps(2)
    .onEnd(() => {
      if (scale.value > 1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        runOnJS(onZoomToggle)(false);
      } else {
        scale.value = withTiming(2);
        runOnJS(onZoomToggle)(true);
      }
      savedScale.value = scale.value > 1 ? 1 : 2;
    });

  const pinchGesture = Gesture.Pinch()
    .onUpdate((e) => {
      scale.value = savedScale.value * e.scale;
      if (scale.value > 1.1) runOnJS(onZoomToggle)(true);
    })
    .onEnd(() => {
      if (scale.value <= 1.1) {
        scale.value = withTiming(1);
        translateX.value = withTiming(0);
        translateY.value = withTiming(0);
        runOnJS(onZoomToggle)(false);
      }
      savedScale.value = scale.value;
    });

  const panGesture = Gesture.Pan()
    .onUpdate((e) => {
      if (scale.value > 1) {
        translateX.value = savedTranslateX.value + e.translationX;
        translateY.value = savedTranslateY.value + e.translationY;
      }
    })
    .onEnd(() => {
      savedTranslateX.value = translateX.value;
      savedTranslateY.value = translateY.value;
    });

  const composed = Gesture.Simultaneous(
    Gesture.Exclusive(doubleTap, tapGesture),
    pinchGesture,
    panGesture
  );

  return (
    <View style={{ width: SW, height: SH, backgroundColor: '#000', justifyContent: 'center' }}>
      <GestureDetector gesture={composed}>
        <Animated.View style={[{ width: SW, height: SH, justifyContent: 'center' }, animatedStyle]}>
          <Image
            source={{ uri: `file://${uri}` }}
            style={{ width: '100%', height: '100%' }}
            resizeMode="contain"
          />
        </Animated.View>
      </GestureDetector>
    </View>
  );
});

// ─── Main PageViewer Component ────────────────────────────────────────
export const PageViewer = ({
  pages,
  initialPage,
  onPageChange,
  mode,
  autoPlay,
  autoPlaySpeed,
}: Props) => {
  const flatRef = useRef<FlatList<string>>(null);
  const heightsRef = useRef<number[]>([]);
  const [scrollEnabled, setScrollEnabled] = useState(true);
  const currentIndexRef = useRef(initialPage);

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: ViewToken[] }) => {
    if (viewableItems?.[0]) {
      const idx = viewableItems[0].index ?? 0;
      currentIndexRef.current = idx;
      onPageChange(idx);
    }
  }, [onPageChange]);

  const viewabilityConfig = useRef({ itemVisiblePercentThreshold: 50 }).current;

  const goToNext = useCallback(() => {
    if (currentIndexRef.current < pages.length - 1) {
      flatRef.current?.scrollToIndex({ index: currentIndexRef.current + 1, animated: true });
    }
  }, [pages.length]);

  const goToPrev = useCallback(() => {
    if (currentIndexRef.current > 0) {
      flatRef.current?.scrollToIndex({ index: currentIndexRef.current - 1, animated: true });
    }
  }, []);

  // --- Fixed Autoplay Logic (TS Fixed) ---
  useEffect(() => {
    let interval: ReturnType<typeof setInterval> | undefined;
    
    if (autoPlay && mode === "autoplay") {
      interval = setInterval(() => {
        goToNext();
      }, autoPlaySpeed * 1000);
    }
    
    return () => {
      if (interval) clearInterval(interval);
    };
  }, [autoPlay, autoPlaySpeed, mode, goToNext]);

  // Handle initial page positioning
  useEffect(() => {
    currentIndexRef.current = initialPage;
    const timer: ReturnType<typeof setTimeout> = setTimeout(() => {
      if (mode === "vertical") {
        const offset = heightsRef.current.slice(0, initialPage).reduce((a, b) => a + (b || 0), 0);
        flatRef.current?.scrollToOffset({ offset, animated: false });
      } else {
        flatRef.current?.scrollToIndex({ index: initialPage, animated: false });
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [mode, initialPage]);

  const renderItem = useCallback(
    ({ item, index: i }: ListRenderItemInfo<string>) => (
      mode === "vertical" ? (
        <VerticalPage uri={item} onLayout={(h) => { heightsRef.current[i] = h; }} />
      ) : (
        <ZoomPage 
          uri={item} 
          onZoomToggle={(zoomed) => setScrollEnabled(!zoomed)} 
          onNext={goToNext}
          onPrev={goToPrev}
        />
      )
    ),
    [mode, goToNext, goToPrev]
  );

  if (pages.length === 0) {
    return (
      <View style={{ flex: 1, backgroundColor: "#000", justifyContent: "center" }}>
        <ActivityIndicator size="large" color="#38D926" />
      </View>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: "#000" }}>
      <StatusBar translucent backgroundColor="transparent" barStyle="light-content" />
      <FlatList
        ref={flatRef}
        data={pages}
        keyExtractor={(item, i) => `${item}-${i}`}
        renderItem={renderItem}
        horizontal={mode !== "vertical"}
        pagingEnabled={mode !== "vertical"}
        // Disable scroll if zoomed OR if autoplay is running (to prevent user conflict)
        scrollEnabled={scrollEnabled && !autoPlay}
        onViewableItemsChanged={onViewableItemsChanged}
        viewabilityConfig={viewabilityConfig}
        getItemLayout={mode !== "vertical" ? (_, i) => ({
          length: SW,
          offset: SW * i,
          index: i,
        }) : undefined}
        onScrollToIndexFailed={(info) => {
          flatRef.current?.scrollToOffset({ 
            offset: info.averageItemLength * info.index, 
            animated: false 
          });
        }}
      />
    </GestureHandlerRootView>
  );
};