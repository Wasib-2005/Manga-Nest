import React, { useRef, useEffect } from "react";
import {
  View, Text, ScrollView, ActivityIndicator, StyleSheet,Platform
} from "react-native";


interface Props {
  logs:     string[];
  loading?: boolean;
}

export const LogConsole = ({ logs, loading }: Props) => {
  console.log(logs)
  const scrollRef = useRef<ScrollView>(null);

  useEffect(() => {
    // Auto-scroll to bottom on new log
    scrollRef.current?.scrollToEnd({ animated: true });
  }, [logs.length]);

  return (
    <View style={s.wrap}>
      <View style={s.titleRow}>
        <View style={s.dot} />
        <Text style={s.title}>console</Text>
        {loading && <ActivityIndicator color="#38D926" size="small" style={{ marginLeft: "auto" }} />}
      </View>
      <ScrollView
        ref={scrollRef}
        style={s.scroll}
        contentContainerStyle={s.scrollContent}
        showsVerticalScrollIndicator={false}
        nestedScrollEnabled
      >
        {logs.map((line, i) => (
          <Text key={i} style={s.line}>{`> ${line}`}</Text>
        ))}
        {logs.length === 0 && (
          <Text style={s.empty}>Waiting for output…</Text>
        )}
      </ScrollView>
    </View>
  );
};

const s = StyleSheet.create({
  wrap: {
    backgroundColor: "#060b14",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#141c2b",
    overflow: "hidden",
  },
  titleRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
    backgroundColor: "#0a0e17",
  },
  dot: {
    width: 6, height: 6, borderRadius: 3,
    backgroundColor: "#38D926",
  },
  title: {
    color: "#334155",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1.5,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
  scroll: { maxHeight: 200 },
  scrollContent: { padding: 12, gap: 3 },
  line: {
    color: "#38D926",
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
    lineHeight: 16,
  },
  empty: {
    color: "#1e293b",
    fontSize: 10,
    fontFamily: Platform.OS === "ios" ? "Menlo" : "monospace",
  },
});

 