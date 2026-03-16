import React from "react";
import { View, Text, TouchableOpacity } from "react-native";

// ─── Done ─────────────────────────────────────────────────────────────────────

interface DoneProps {
  uri:     string;
  onReset: () => void;
}

export const DoneCard = ({ uri, onReset }: DoneProps) => (
  <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-100">
    <Text className="text-[#38D926] font-bold text-base mb-1">Download complete ✓</Text>
    <Text className="text-xs text-gray-400 mb-3" numberOfLines={3}>{uri}</Text>
    <TouchableOpacity onPress={onReset} className="bg-[#38D926] rounded-xl py-3 items-center">
      <Text className="text-white font-bold">Download another</Text>
    </TouchableOpacity>
  </View>
);

// ─── Error ────────────────────────────────────────────────────────────────────

interface ErrorProps {
  message: string;
  onReset: () => void;
}

export const ErrorCard = ({ message, onReset }: ErrorProps) => (
  <View className="bg-red-50 rounded-2xl p-4 mb-4 border border-red-100">
    <Text className="text-red-500 font-bold mb-1">Error</Text>
    <Text className="text-red-400 text-sm mb-3">{message}</Text>
    <TouchableOpacity onPress={onReset} className="bg-red-400 rounded-xl py-2 items-center">
      <Text className="text-white font-bold">Try again</Text>
    </TouchableOpacity>
  </View>
);