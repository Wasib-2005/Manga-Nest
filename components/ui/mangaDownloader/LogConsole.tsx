import React from "react";
import { View, Text, ActivityIndicator } from "react-native";

interface Props {
  logs:     string[];
  loading?: boolean;
}

export const LogConsole = ({ logs, loading }: Props) => (
  <View className="bg-gray-900 rounded-2xl p-3">
    <Text className="text-gray-500 text-xs mb-2">console</Text>
    {logs.map((l, i) => (
      <Text key={i} className="text-green-400 text-xs font-mono mb-0.5">{`> ${l}`}</Text>
    ))}
    {loading && <ActivityIndicator color="#38D926" style={{ marginTop: 4 }} />}
  </View>
);