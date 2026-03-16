import React, { useState, useEffect, useRef } from "react";
import {
  View,
  Image,
  ScrollView,
  TouchableOpacity,
  Text,
  ActivityIndicator,
  Dimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Props {
  pages: string[];
  initialPage: number;
  onPageChange: (page: number) => void;
  onHideToggle: () => void;
  mode: "vertical" | "horizontal";
  zoom: number;
  autoPlay: boolean;
  autoPlaySpeed: number;
}

export const PageViewer = ({
  pages,
  initialPage,
  onPageChange,
  onHideToggle,
  mode,
  zoom,
  autoPlay,
  autoPlaySpeed,
}: Props) => {
  const [currentPage, setCurrentPage] = useState(initialPage);
  const [showControls, setShowControls] = useState(true);
  const scrollViewRef = useRef<ScrollView>(null);
  const autoPlayRef = useRef<number | null>(null); // ✅ FIXED: setInterval returns number

  const screenWidth = Dimensions.get("window").width;
  const screenHeight = Dimensions.get("window").height;

  // Handle autoplay
  useEffect(() => {
    if (!autoPlay || pages.length === 0) {
      if (autoPlayRef.current !== null) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
      return;
    }

    if (autoPlayRef.current !== null) {
      clearInterval(autoPlayRef.current);
    }

    const interval = 1000 / autoPlaySpeed;
    autoPlayRef.current = setInterval(() => {
      setCurrentPage((prev) => {
        const next = prev + 1;
        return next >= pages.length ? 0 : next;
      });
    }, interval);

    return () => {
      if (autoPlayRef.current !== null) {
        clearInterval(autoPlayRef.current);
        autoPlayRef.current = null;
      }
    };
  }, [autoPlay, autoPlaySpeed, pages.length]);

  useEffect(() => {
    onPageChange(currentPage);
  }, [currentPage, onPageChange]);

  useEffect(() => {
    if (mode === "horizontal" && scrollViewRef.current) {
      setTimeout(() => {
        scrollViewRef.current?.scrollTo({
          x: currentPage * screenWidth,
          animated: false,
        });
      }, 0);
    }
  }, [currentPage, mode, screenWidth]);

  const toggleControls = () => {
    setShowControls(!showControls);
  };

  if (pages.length === 0) {
    return (
      <View className="flex-1 bg-gray-950 justify-center items-center">
        <ActivityIndicator size="large" color="#10b981" />
      </View>
    );
  }

  return (
    <View className="flex-1 bg-gray-950">
      {mode === "vertical" ? (
        // Vertical scroll
        <ScrollView
          scrollEnabled={!autoPlay}
          contentContainerStyle={{
            alignItems: "center",
            paddingVertical: 12,
            backgroundColor: "#030712",
          }}
          showsVerticalScrollIndicator={false}
        >
          {pages.map((pageUri, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={toggleControls}
              activeOpacity={1}
              style={{ transform: [{ scale: zoom }] }}
            >
              <Image
                source={{ uri: `file://${pageUri}` }}
                style={{
                  width: screenWidth * 0.95,
                  height: screenHeight * 0.8,
                }}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      ) : (
        // Horizontal swipe
        <ScrollView
          ref={scrollViewRef}
          horizontal
          pagingEnabled
          scrollEnabled={!autoPlay}
          contentContainerStyle={{
            alignItems: "center",
          }}
          showsHorizontalScrollIndicator={false}
          snapToInterval={screenWidth}
          decelerationRate="fast"
        >
          {pages.map((pageUri, idx) => (
            <TouchableOpacity
              key={idx}
              onPress={toggleControls}
              activeOpacity={1}
              style={{ width: screenWidth, height: screenHeight }}
            >
              <Image
                source={{ uri: `file://${pageUri}` }}
                style={{
                  width: "100%",
                  height: "100%",
                  transform: [{ scale: zoom }],
                }}
                resizeMode="contain"
              />
            </TouchableOpacity>
          ))}
        </ScrollView>
      )}

      {/* Modern Controls Overlay */}
      {showControls && (
        <View className="absolute inset-0 bg-gradient-to-b from-black/40 via-transparent to-black/40 flex justify-between p-4">
          {/* Top Bar */}
          <View className="flex-row justify-between items-center">
            <TouchableOpacity
              onPress={onHideToggle}
              className="bg-white/10 backdrop-blur-md rounded-full p-2.5 border border-white/20"
            >
              <MaterialCommunityIcons name="eye-off" size={20} color="white" />
            </TouchableOpacity>

            <View className="bg-white/10 backdrop-blur-md rounded-full px-4 py-2 border border-white/20">
              <Text className="text-white font-semibold text-sm">
                {currentPage + 1}/{pages.length}
              </Text>
            </View>

            <TouchableOpacity
              onPress={toggleControls}
              className="bg-white/10 backdrop-blur-md rounded-full p-2.5 border border-white/20"
            >
              <MaterialCommunityIcons name="close" size={20} color="white" />
            </TouchableOpacity>
          </View>

          {/* Bottom Bar */}
          <View className="flex-row justify-center items-center gap-3 bg-white/10 backdrop-blur-md rounded-2xl p-3 border border-white/20">
            {mode === "horizontal" && (
              <>
                <TouchableOpacity
                  onPress={() => setCurrentPage(Math.max(0, currentPage - 1))}
                  disabled={currentPage === 0}
                  className="p-2.5 rounded-full bg-white/10"
                >
                  <MaterialCommunityIcons
                    name="chevron-left"
                    size={24}
                    color={currentPage === 0 ? "#666" : "#10b981"}
                  />
                </TouchableOpacity>
              </>
            )}

            <View className="flex-1 mx-2">
              <Text className="text-white text-xs text-center font-medium">
                Page {currentPage + 1}
              </Text>
            </View>

            {mode === "horizontal" && (
              <>
                <TouchableOpacity
                  onPress={() =>
                    setCurrentPage(Math.min(pages.length - 1, currentPage + 1))
                  }
                  disabled={currentPage === pages.length - 1}
                  className="p-2.5 rounded-full bg-white/10"
                >
                  <MaterialCommunityIcons
                    name="chevron-right"
                    size={24}
                    color={currentPage === pages.length - 1 ? "#666" : "#10b981"}
                  />
                </TouchableOpacity>
              </>
            )}
          </View>
        </View>
      )}
    </View>
  );
};