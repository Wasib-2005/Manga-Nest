import React, { useState } from "react";
import {
  Modal, View, Text, TouchableOpacity,
  TextInput, Switch, ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ViewMode } from "./pageViewer";

interface Props {
  visible:       boolean;
  onClose:       () => void;
  mode:          ViewMode;
  onModeChange:  (m: ViewMode) => void;
  autoPlay:      boolean;
  onAutoPlay:    (v: boolean) => void;
  autoPlaySpeed: number;       // seconds per page
  onSpeedChange: (v: number) => void;
  currentPage:   number;
  totalPages:    number;
  onJumpToPage:  (page: number) => void;
}

const MODES: { key: ViewMode; label: string; icon: string; desc: string }[] = [
  { key: "horizontal", label: "Swipe",     icon: "gesture-swipe-horizontal", desc: "Swipe left / right" },
  { key: "autoplay",   label: "Slideshow", icon: "play-box-outline",          desc: "Crossfade, no black flash" },
  { key: "vertical",   label: "Scroll",    icon: "gesture-swipe-down",        desc: "Webtoon / long-strip" },
];

const SPEED_PRESETS = [0.5, 1, 2, 3, 5, 8];

export const SettingsModal = ({
  visible, onClose,
  mode, onModeChange,
  autoPlay, onAutoPlay,
  autoPlaySpeed, onSpeedChange,
  currentPage, totalPages, onJumpToPage,
}: Props) => {
  const [jumpText, setJumpText] = useState("");

  const handleJump = () => {
    const n = parseInt(jumpText, 10);
    if (!isNaN(n) && n >= 1 && n <= totalPages) {
      onJumpToPage(n - 1);
      setJumpText("");
      onClose();
    }
  };

  const bumpSpeed = (delta: number) => {
    const next = Math.round((autoPlaySpeed + delta) * 10) / 10;
    onSpeedChange(Math.min(30, Math.max(0.2, next)));
  };

  const SectionLabel = ({ icon, text }: { icon: string; text: string }) => (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 12 }}>
      <MaterialCommunityIcons name={icon as any} size={16} color="#475569" />
      <Text style={{ color: "#64748b", fontSize: 11, fontWeight: "700",
        textTransform: "uppercase", letterSpacing: 1 }}>{text}</Text>
    </View>
  );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* Tap outside to close */}
      <TouchableOpacity style={{ flex: 1 }} activeOpacity={1} onPress={onClose} />

      <View style={{ backgroundColor: "#080c12",
        borderTopLeftRadius: 24, borderTopRightRadius: 24,
        borderTopWidth: 1, borderColor: "#1e293b" }}>

        {/* Handle */}
        <View style={{ alignItems: "center", paddingTop: 10, paddingBottom: 2 }}>
          <View style={{ width: 40, height: 4, borderRadius: 2, backgroundColor: "#1e293b" }} />
        </View>

        {/* Header */}
        <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center",
          paddingHorizontal: 20, paddingVertical: 12,
          borderBottomWidth: 1, borderBottomColor: "#0f172a" }}>
          <Text style={{ color: "#f1f5f9", fontSize: 16, fontWeight: "700" }}>Reader Settings</Text>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
            <MaterialCommunityIcons name="close" size={20} color="#475569" />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 20, paddingBottom: 44 }}>

          {/* ── View Mode ─────────────────────────────────────────────────── */}
          <SectionLabel icon="eye-outline" text="View Mode" />
          <View style={{ flexDirection: "row", gap: 8, marginBottom: 24 }}>
            {MODES.map(m => {
              const active = mode === m.key;
              return (
                <TouchableOpacity key={m.key} onPress={() => onModeChange(m.key)}
                  style={{ flex: 1, alignItems: "center", paddingVertical: 10, borderRadius: 10,
                    backgroundColor: active ? "#38D92618" : "#0f172a",
                    borderWidth: 1, borderColor: active ? "#38D926" : "#1e293b" }}>
                  <MaterialCommunityIcons name={m.icon as any} size={22}
                    color={active ? "#38D926" : "#475569"} />
                  <Text style={{ color: active ? "#38D926" : "#475569",
                    fontSize: 11, fontWeight: "700", marginTop: 4 }}>{m.label}</Text>
                  <Text style={{ color: active ? "#38D92699" : "#334155",
                    fontSize: 9, marginTop: 2, textAlign: "center" }}>{m.desc}</Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Autoplay ──────────────────────────────────────────────────── */}
          <View style={{ flexDirection: "row", alignItems: "center",
            justifyContent: "space-between", marginBottom: 20 }}>
            <SectionLabel icon="play-circle-outline" text="Autoplay" />
            <Switch
              value={autoPlay}
              onValueChange={onAutoPlay}
              trackColor={{ false: "#1e293b", true: "#38D92655" }}
              thumbColor={autoPlay ? "#38D926" : "#334155"}
            />
          </View>

          {/* ── Speed ─────────────────────────────────────────────────────── */}
          <View style={{ marginBottom: 24 }}>
            <View style={{ flexDirection: "row", justifyContent: "space-between",
              alignItems: "center", marginBottom: 12 }}>
              <SectionLabel icon="speedometer-outline" text="Speed (seconds / page)" />
              <View style={{ backgroundColor: "#38D92618", borderRadius: 6,
                paddingHorizontal: 8, paddingVertical: 3,
                borderWidth: 1, borderColor: "#38D92633" }}>
                <Text style={{ color: "#38D926", fontSize: 12, fontWeight: "700" }}>
                  {autoPlaySpeed}s
                </Text>
              </View>
            </View>

            {/* Preset buttons */}
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 10 }}>
              {SPEED_PRESETS.map(s => {
                const active = autoPlaySpeed === s;
                return (
                  <TouchableOpacity key={s} onPress={() => onSpeedChange(s)}
                    style={{ paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
                      backgroundColor: active ? "#38D92618" : "#0f172a",
                      borderWidth: 1, borderColor: active ? "#38D926" : "#1e293b" }}>
                    <Text style={{ color: active ? "#38D926" : "#475569",
                      fontSize: 13, fontWeight: "600" }}>{s}s</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            {/* Fine-tune +/- */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <TouchableOpacity onPress={() => bumpSpeed(-0.5)}
                style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#0f172a",
                  borderWidth: 1, borderColor: "#1e293b",
                  justifyContent: "center", alignItems: "center" }}>
                <MaterialCommunityIcons name="minus" size={20} color="#64748b" />
              </TouchableOpacity>

              <View style={{ flex: 1, alignItems: "center", backgroundColor: "#0f172a",
                borderRadius: 10, paddingVertical: 10,
                borderWidth: 1, borderColor: "#1e293b" }}>
                <Text style={{ color: "#94a3b8", fontSize: 13, fontWeight: "600" }}>
                  {autoPlaySpeed}s per page
                </Text>
              </View>

              <TouchableOpacity onPress={() => bumpSpeed(0.5)}
                style={{ width: 40, height: 40, borderRadius: 10, backgroundColor: "#0f172a",
                  borderWidth: 1, borderColor: "#1e293b",
                  justifyContent: "center", alignItems: "center" }}>
                <MaterialCommunityIcons name="plus" size={20} color="#64748b" />
              </TouchableOpacity>
            </View>
          </View>

          {/* ── Jump to page ──────────────────────────────────────────────── */}
          <View>
            <SectionLabel icon="navigation-variant-outline"
              text={`Jump to page  (1 – ${totalPages})`} />
            <View style={{ flexDirection: "row", gap: 8 }}>
              <TextInput
                value={jumpText}
                onChangeText={setJumpText}
                placeholder={`Now: ${currentPage + 1}`}
                placeholderTextColor="#334155"
                keyboardType="number-pad"
                returnKeyType="go"
                onSubmitEditing={handleJump}
                style={{ flex: 1, backgroundColor: "#0f172a", borderRadius: 10,
                  borderWidth: 1, borderColor: "#1e293b",
                  paddingHorizontal: 14, paddingVertical: 11,
                  color: "#f1f5f9", fontSize: 14 }}
              />
              <TouchableOpacity onPress={handleJump}
                style={{ backgroundColor: "#38D926", borderRadius: 10,
                  paddingHorizontal: 20, justifyContent: "center" }}>
                <Text style={{ color: "#000", fontWeight: "800", fontSize: 13 }}>Go</Text>
              </TouchableOpacity>
            </View>
          </View>

        </ScrollView>
      </View>
    </Modal>
  );
};