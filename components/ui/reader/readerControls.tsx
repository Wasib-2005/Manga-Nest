import React from "react";
import {
  View,
  Text,
  TouchableOpacity,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Props {
  zoom: number;
  onZoomChange: (zoom: number) => void;
  mode: "vertical" | "horizontal";
  onModeChange: (mode: "vertical" | "horizontal") => void;
  autoPlay: boolean;
  onAutoPlayToggle: (enabled: boolean) => void;
  autoPlaySpeed: number;
  onSpeedChange: (speed: number) => void;
  onJumpToPage: () => void;
  currentPage: number;
  totalPages: number;
}

export const ReaderControls = ({
  zoom,
  onZoomChange,
  mode,
  onModeChange,
  autoPlay,
  onAutoPlayToggle,
  autoPlaySpeed,
  onSpeedChange,
  onJumpToPage,
  currentPage,
  totalPages,
}: Props) => {
  const zoomLevels = [0.8, 1, 1.2, 1.5, 2];
  const speedLevels = [0.25, 0.5, 1, 1.5, 2];

  return (
    <View className="bg-gradient-to-t from-slate-950 to-slate-900 border-t border-slate-800">
      <ScrollView
        contentContainerStyle={{ paddingHorizontal: 16, paddingVertical: 16 }}
        scrollEnabled={false}
      >
        {/* Reading Mode */}
        <View className="mb-6">
          <View className="flex-row items-center gap-2 mb-3">
            <MaterialCommunityIcons name="text-box-outline" size={16} color="#94a3b8" />
            <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider">
              Reading Mode
            </Text>
          </View>
          <View className="flex-row gap-2">
            <TouchableOpacity
              onPress={() => onModeChange("vertical")}
              className={`flex-1 rounded-lg py-3 items-center border ${
                mode === "vertical"
                  ? "bg-emerald-500/20 border-emerald-500"
                  : "bg-slate-800/50 border-slate-700"
              }`}
            >
              <MaterialCommunityIcons
                name="arrow-down"
                size={20}
                color={mode === "vertical" ? "#10b981" : "#94a3b8"}
              />
              <Text
                className={`text-xs mt-1.5 font-semibold ${
                  mode === "vertical" ? "text-emerald-400" : "text-slate-400"
                }`}
              >
                Vertical
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              onPress={() => onModeChange("horizontal")}
              className={`flex-1 rounded-lg py-3 items-center border ${
                mode === "horizontal"
                  ? "bg-emerald-500/20 border-emerald-500"
                  : "bg-slate-800/50 border-slate-700"
              }`}
            >
              <MaterialCommunityIcons
                name="arrow-right"
                size={20}
                color={mode === "horizontal" ? "#10b981" : "#94a3b8"}
              />
              <Text
                className={`text-xs mt-1.5 font-semibold ${
                  mode === "horizontal" ? "text-emerald-400" : "text-slate-400"
                }`}
              >
                Horizontal
              </Text>
            </TouchableOpacity>
          </View>
        </View>

        {/* Zoom Control */}
        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-3">
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="magnify-plus" size={16} color="#94a3b8" />
              <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Zoom
              </Text>
            </View>
            <View className="bg-emerald-500/20 border border-emerald-500/40 rounded-full px-2.5 py-1">
              <Text className="text-xs font-bold text-emerald-400">
                {Math.round(zoom * 100)}%
              </Text>
            </View>
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View className="flex-row gap-2">
              {zoomLevels.map((level) => (
                <TouchableOpacity
                  key={level}
                  onPress={() => onZoomChange(level)}
                  className={`px-4 py-2 rounded-lg border ${
                    Math.abs(zoom - level) < 0.01
                      ? "bg-emerald-500/20 border-emerald-500"
                      : "bg-slate-800/50 border-slate-700"
                  }`}
                >
                  <Text
                    className={`text-xs font-semibold ${
                      Math.abs(zoom - level) < 0.01
                        ? "text-emerald-400"
                        : "text-slate-400"
                    }`}
                  >
                    {Math.round(level * 100)}%
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          </ScrollView>
        </View>

        {/* Autoplay */}
        <View className="mb-6">
          <View className="flex-row justify-between items-center mb-3">
            <View className="flex-row items-center gap-2">
              <MaterialCommunityIcons name="play-circle" size={16} color="#94a3b8" />
              <Text className="text-xs font-bold text-slate-300 uppercase tracking-wider">
                Autoplay
              </Text>
            </View>
            <TouchableOpacity
              onPress={() => onAutoPlayToggle(!autoPlay)}
              className={`px-3 py-1.5 rounded-full border ${
                autoPlay
                  ? "bg-emerald-500/20 border-emerald-500"
                  : "bg-slate-800/50 border-slate-700"
              }`}
            >
              <Text
                className={`text-xs font-bold ${
                  autoPlay ? "text-emerald-400" : "text-slate-400"
                }`}
              >
                {autoPlay ? "ON" : "OFF"}
              </Text>
            </TouchableOpacity>
          </View>

          {autoPlay && (
            <>
              <View className="flex-row justify-between items-center mb-3 px-3 py-2 bg-slate-800/50 rounded-lg border border-slate-700">
                <Text className="text-xs text-slate-400 font-medium">Speed</Text>
                <Text className="text-xs font-bold text-emerald-400">
                  {autoPlaySpeed.toFixed(2)}x
                </Text>
              </View>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <View className="flex-row gap-2">
                  {speedLevels.map((speed) => (
                    <TouchableOpacity
                      key={speed}
                      onPress={() => onSpeedChange(speed)}
                      className={`px-4 py-2 rounded-lg border ${
                        Math.abs(autoPlaySpeed - speed) < 0.01
                          ? "bg-emerald-500/20 border-emerald-500"
                          : "bg-slate-800/50 border-slate-700"
                      }`}
                    >
                      <Text
                        className={`text-xs font-semibold ${
                          Math.abs(autoPlaySpeed - speed) < 0.01
                            ? "text-emerald-400"
                            : "text-slate-400"
                        }`}
                      >
                        {speed.toFixed(2)}x
                      </Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </ScrollView>
            </>
          )}
        </View>

        {/* Jump to Page */}
        <TouchableOpacity
          onPress={onJumpToPage}
          className="bg-gradient-to-r from-emerald-600 to-emerald-500 rounded-lg py-3 items-center flex-row justify-center gap-2 shadow-lg"
        >
          <MaterialCommunityIcons name="numeric" size={18} color="white" />
          <Text className="text-white font-bold text-sm">
            Jump to Page ({currentPage + 1}/{totalPages})
          </Text>
        </TouchableOpacity>
      </ScrollView>
    </View>
  );
};