import React, { useState } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ViewMode } from "./pageViewer";

interface Props {
  visible: boolean;
  onClose: () => void;
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  autoPlay: boolean;
  onAutoPlay: (v: boolean) => void;
  autoPlaySpeed: number;
  onSpeedChange: (v: number) => void;
  currentPage: number;
  totalPages: number;
  onJumpToPage: (page: number) => void;
}

const MODES: { key: ViewMode; label: string; icon: string; desc: string }[] = [
  {
    key: "horizontal",
    label: "Swipe",
    icon: "gesture-swipe-horizontal",
    desc: "Tap zones or swipe",
  },
  {
    key: "autoplay",
    label: "Slideshow",
    icon: "play-box-outline",
    desc: "Auto-advance pages",
  },
  {
    key: "vertical",
    label: "Scroll",
    icon: "gesture-swipe-down",
    desc: "Webtoon / long-strip",
  },
];

const SPEED_PRESETS = [0.5, 1, 2, 3, 5, 8];

export const SettingsModal = ({
  visible,
  onClose,
  mode,
  onModeChange,
  autoPlay,
  onAutoPlay,
  autoPlaySpeed,
  onSpeedChange,
  currentPage,
  totalPages,
  onJumpToPage,
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

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      {/* Tap outside to dismiss */}
      <TouchableOpacity
        style={{ flex: 1 }}
        activeOpacity={1}
        onPress={onClose}
      />

      <View style={s.sheet}>
        {/* Grab bar */}
        <View style={s.grabBarWrapper}>
          <View style={s.grabBar} />
        </View>

        {/* Header */}
        <View style={s.header}>
          <View style={s.headerLeft}>
            <MaterialCommunityIcons
              name="book-open-variant"
              size={18}
              color="#38D926"
            />
            <Text style={s.headerTitle}>Reader Settings</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn}>
            <MaterialCommunityIcons name="close" size={18} color="#475569" />
          </TouchableOpacity>
        </View>

        <ScrollView
          contentContainerStyle={s.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          {/* ── View Mode ─────────────────────────────────────────────────── */}
          <SectionLabel icon="eye-outline" text="View Mode" />
          <View style={s.modeRow}>
            {MODES.map((m) => {
              const active = mode === m.key;
              return (
                <TouchableOpacity
                  key={m.key}
                  onPress={() => onModeChange(m.key)}
                  style={[s.modeCard, active && s.modeCardActive]}
                  activeOpacity={0.7}
                >
                  <View
                    style={[s.modeIconWrap, active && s.modeIconWrapActive]}
                  >
                    <MaterialCommunityIcons
                      name={m.icon as any}
                      size={22}
                      color={active ? "#38D926" : "#334155"}
                    />
                  </View>
                  <Text style={[s.modeLabel, active && s.modeLabelActive]}>
                    {m.label}
                  </Text>
                  <Text style={s.modeDesc} numberOfLines={1}>
                    {m.desc}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>

          {/* ── Tap zones info (horizontal/autoplay only) ─────────────────── */}
          {(mode === "horizontal" || mode === "autoplay") && (
            <View style={s.tapZoneInfo}>
              <View style={s.tapZoneItem}>
                <View style={[s.tapZoneDot, { backgroundColor: "#f97316" }]} />
                <Text style={s.tapZoneText}>Left 28% → Prev page</Text>
              </View>
              <View style={s.tapZoneItem}>
                <View style={[s.tapZoneDot, { backgroundColor: "#38D926" }]} />
                <Text style={s.tapZoneText}>Middle → Show/hide UI</Text>
              </View>
              <View style={s.tapZoneItem}>
                <View style={[s.tapZoneDot, { backgroundColor: "#3b82f6" }]} />
                <Text style={s.tapZoneText}>Right 28% → Next page</Text>
              </View>
            </View>
          )}

          {/* ── Autoplay (only when mode = autoplay) ────────────────────── */}
          {mode === "autoplay" && (
            <View style={s.section}>
              <View style={s.rowBetween}>
                <SectionLabel icon="play-circle-outline" text="Autoplay" />
                <Switch
                  value={autoPlay}
                  onValueChange={onAutoPlay}
                  trackColor={{ false: "#1e293b", true: "#38D92655" }}
                  thumbColor={autoPlay ? "#38D926" : "#334155"}
                />
              </View>

              <View style={s.speedHeader}>
                <SectionLabel
                  icon="speedometer-outline"
                  text="Seconds / page"
                />
                <View style={s.speedBadge}>
                  <Text style={s.speedBadgeText}>{autoPlaySpeed}s</Text>
                </View>
              </View>

              {/* Presets */}
              <View style={s.presetRow}>
                {SPEED_PRESETS.map((sp) => {
                  const active = autoPlaySpeed === sp;
                  return (
                    <TouchableOpacity
                      key={sp}
                      onPress={() => onSpeedChange(sp)}
                      style={[s.preset, active && s.presetActive]}
                    >
                      <Text style={[s.presetText, active && s.presetTextActive]}>
                        {sp}s
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Fine-tune */}
              <View style={s.fineTune}>
                <TouchableOpacity
                  onPress={() => bumpSpeed(-0.5)}
                  style={s.fineTuneBtn}
                >
                  <MaterialCommunityIcons name="minus" size={20} color="#64748b" />
                </TouchableOpacity>
                <View style={s.fineTuneValue}>
                  <Text style={s.fineTuneValueText}>
                    {autoPlaySpeed}s per page
                  </Text>
                </View>
                <TouchableOpacity
                  onPress={() => bumpSpeed(0.5)}
                  style={s.fineTuneBtn}
                >
                  <MaterialCommunityIcons name="plus" size={20} color="#64748b" />
                </TouchableOpacity>
              </View>
            </View>
          )}

          {/* ── Jump to Page ─────────────────────────────────────────────── */}
          <View style={s.section}>
            <SectionLabel
              icon="navigation-variant-outline"
              text={`Jump to page (1 – ${totalPages})`}
            />
            <View style={s.jumpRow}>
              <TextInput
                value={jumpText}
                onChangeText={setJumpText}
                placeholder={`Now: ${currentPage + 1}`}
                placeholderTextColor="#334155"
                keyboardType="number-pad"
                returnKeyType="go"
                onSubmitEditing={handleJump}
                style={s.jumpInput}
              />
              <TouchableOpacity onPress={handleJump} style={s.jumpBtn}>
                <Text style={s.jumpBtnText}>Go</Text>
              </TouchableOpacity>
            </View>

            {/* Page progress bar */}
            <View style={s.progressTrack}>
              <View
                style={[
                  s.progressFill,
                  { width: `${((currentPage + 1) / totalPages) * 100}%` },
                ]}
              />
            </View>
            <Text style={s.progressLabel}>
              Page {currentPage + 1} of {totalPages}
            </Text>
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

// ── Small reusable section header ─────────────────────────────────────────────

const SectionLabel = ({
  icon,
  text,
}: {
  icon: string;
  text: string;
}) => (
  <View style={s.sectionLabel}>
    <MaterialCommunityIcons name={icon as any} size={14} color="#38D926" />
    <Text style={s.sectionLabelText}>{text}</Text>
  </View>
);

// ── Styles ────────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  sheet: {
    backgroundColor: "#060a10",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "#141c2b",
    // subtle green glow on top edge
    shadowColor: "#38D926",
    shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.08,
    shadowRadius: 20,
    elevation: 20,
  },
  grabBarWrapper: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 4,
  },
  grabBar: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#1e293b",
  },

  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 22,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#0d1420",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    color: "#f1f5f9",
    fontSize: 16,
    fontWeight: "800",
    letterSpacing: 0.2,
  },
  closeBtn: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: "#0d1420",
    borderWidth: 1,
    borderColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
  },

  scrollContent: {
    paddingHorizontal: 22,
    paddingTop: 22,
    paddingBottom: 48,
    gap: 4,
  },

  // ── Section label
  sectionLabel: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    marginBottom: 12,
  },
  sectionLabelText: {
    color: "#38D926",
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1.2,
  },

  section: {
    marginTop: 24,
  },

  // ── Mode cards
  modeRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 16,
  },
  modeCard: {
    flex: 1,
    alignItems: "center",
    paddingVertical: 14,
    paddingHorizontal: 6,
    borderRadius: 16,
    backgroundColor: "#0d1420",
    borderWidth: 1,
    borderColor: "#141c2b",
    gap: 6,
  },
  modeCardActive: {
    backgroundColor: "#38D92610",
    borderColor: "#38D926",
  },
  modeIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#141c2b",
    justifyContent: "center",
    alignItems: "center",
  },
  modeIconWrapActive: {
    backgroundColor: "#38D92620",
  },
  modeLabel: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "800",
  },
  modeLabelActive: {
    color: "#38D926",
  },
  modeDesc: {
    color: "#334155",
    fontSize: 9,
    textAlign: "center",
  },

  // ── Tap zone info
  tapZoneInfo: {
    backgroundColor: "#0d1420",
    borderRadius: 12,
    padding: 14,
    gap: 8,
    borderWidth: 1,
    borderColor: "#141c2b",
    marginBottom: 8,
  },
  tapZoneItem: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  tapZoneDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
  },
  tapZoneText: {
    color: "#475569",
    fontSize: 12,
    fontWeight: "600",
  },

  // ── Autoplay
  rowBetween: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
  },
  speedHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 12,
  },
  speedBadge: {
    backgroundColor: "#38D92618",
    borderRadius: 8,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderWidth: 1,
    borderColor: "#38D92630",
  },
  speedBadgeText: {
    color: "#38D926",
    fontSize: 12,
    fontWeight: "700",
  },
  presetRow: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 14,
  },
  preset: {
    paddingHorizontal: 16,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#0d1420",
    borderWidth: 1,
    borderColor: "#141c2b",
  },
  presetActive: {
    backgroundColor: "#38D92618",
    borderColor: "#38D926",
  },
  presetText: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "700",
  },
  presetTextActive: {
    color: "#38D926",
  },
  fineTune: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  fineTuneBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: "#0d1420",
    borderWidth: 1,
    borderColor: "#141c2b",
    justifyContent: "center",
    alignItems: "center",
  },
  fineTuneValue: {
    flex: 1,
    backgroundColor: "#0d1420",
    borderRadius: 12,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "#141c2b",
    alignItems: "center",
  },
  fineTuneValueText: {
    color: "#94a3b8",
    fontSize: 13,
    fontWeight: "600",
  },

  // ── Jump to page
  jumpRow: {
    flexDirection: "row",
    gap: 10,
    marginBottom: 14,
  },
  jumpInput: {
    flex: 1,
    backgroundColor: "#0d1420",
    borderRadius: 12,
    borderWidth: 1,
    borderColor: "#141c2b",
    paddingHorizontal: 16,
    paddingVertical: 13,
    color: "#f1f5f9",
    fontSize: 15,
    fontWeight: "600",
  },
  jumpBtn: {
    backgroundColor: "#38D926",
    borderRadius: 12,
    paddingHorizontal: 24,
    justifyContent: "center",
    alignItems: "center",
    // subtle inner glow
    shadowColor: "#38D926",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 4,
  },
  jumpBtnText: {
    color: "#000",
    fontWeight: "900",
    fontSize: 14,
  },

  // ── Progress
  progressTrack: {
    height: 3,
    backgroundColor: "#141c2b",
    borderRadius: 2,
    overflow: "hidden",
    marginBottom: 8,
  },
  progressFill: {
    height: "100%",
    backgroundColor: "#38D926",
    borderRadius: 2,
  },
  progressLabel: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "600",
    textAlign: "center",
  },
});