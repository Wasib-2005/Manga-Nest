import React from "react";
import { View, Text } from "react-native";

interface Props {
  current: number;
  total:   number;
}

export const ProgressBar = ({ current, total }: Props) => {
  const pct = total > 0 ? Math.round((current / total) * 100) : 0;
  return (
    <View className="mb-4">
      <View className="h-2 bg-gray-200 rounded-full overflow-hidden mb-1">
        <View className="h-2 bg-[#38D926] rounded-full" style={{ width: `${pct}%` }} />
      </View>
      <Text className="text-xs text-gray-500 text-right">{pct}% — {current}/{total}</Text>
    </View>
  );
};