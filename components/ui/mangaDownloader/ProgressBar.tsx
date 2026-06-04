import React from "react";
import { View, Text, StyleSheet } from "react-native";

interface Props {
  current: number;
  total:   number;
}

export const ProgressBar = ({ current, total }: Props) => {
  const pct = total > 0 ? Math.min(100, Math.round((current / total) * 100)) : 0;
  return (
    <View style={s.wrap}>
      <View style={s.track}>
        <View style={[s.fill, { width: `${pct}%` as any }]} />
        {/* Glowing head */}
        {pct > 0 && pct < 100 && (
          <View style={[s.head, { left: `${pct}%` as any }]} />
        )}
      </View>
      <View style={s.labelRow}>
        <Text style={s.pct}>{pct}%</Text>
        <Text style={s.count}>{current} / {total} pages</Text>
      </View>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: { gap: 6 },
  track: {
    height: 5,
    backgroundColor: "#1e293b",
    borderRadius: 3,
    overflow: "visible",
    position: "relative",
  },
  fill: {
    position: "absolute",
    top: 0, left: 0, bottom: 0,
    backgroundColor: "#38D926",
    borderRadius: 3,
  },
  head: {
    position: "absolute",
    top: -3,
    width: 10, height: 10,
    borderRadius: 5,
    backgroundColor: "#38D926",
    marginLeft: -5,
    shadowColor: "#38D926",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 1,
    shadowRadius: 6,
    elevation: 4,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  pct:   { color: "#38D926", fontSize: 10, fontWeight: "800" },
  count: { color: "#334155", fontSize: 10, fontWeight: "600" },
});