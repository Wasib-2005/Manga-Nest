import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  TextInput,
  Switch,
  ScrollView,
  StyleSheet,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ViewMode } from "./pageViewer";
import { setTitlePage, clearTitlePage } from "../../../services/reader/libraryService";

interface Props {
  visible: boolean;
  onClose: () => void;
  // ── reader state ──────────────────────────────────────────────────────────
  mode: ViewMode;
  onModeChange: (m: ViewMode) => void;
  autoPlay: boolean;
  onAutoPlay: (v: boolean) => void;
  autoPlaySpeed: number;
  onSpeedChange: (v: number) => void;
  currentPage: number;
  totalPages: number;
  onJumpToPage: (page: number) => void;
  // ── title-page feature ────────────────────────────────────────────────────
  /** uid of the manga currently open */
  mangaUid: string;
  /** ep (chapter) currently open */
  currentEp: string;
  /**
   * Called after a title-page is successfully set or cleared so the
   * parent (LibraryScreen) can refresh cover images.
   */
  onTitlePageChanged?: () => void;
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
  mangaUid,
  currentEp,
  onTitlePageChanged,
}: Props) => {
  console.log(currentEp)
  const [jumpText, setJumpText] = useState("");
  const [isTitlePage, setIsTitlePage] = useState(false);
  const [titlePageSaving, setTitlePageSaving] = useState(false);

  // Reset jump input when modal opens
  useEffect(() => {
    if (visible) setJumpText("");
  }, [visible]);

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

  // ── Title-page toggle ─────────────────────────────────────────────────────

  const handleTitlePageToggle = async (value: boolean) => {
    if (titlePageSaving) return;
    setTitlePageSaving(true);
    try {
      if (value) {
        await setTitlePage(mangaUid, currentEp, currentPage);
        setIsTitlePage(true);
        onTitlePageChanged?.();
        Alert.alert(
          "Title Page Set",
          `Page ${currentPage + 1} of EP ${currentEp} is now the cover image.`,
          [{ text: "OK" }],
        );
      } else {
        await clearTitlePage(mangaUid);
        setIsTitlePage(false);
        onTitlePageChanged?.();
        Alert.alert(
          "Title Page Cleared",
          "Cover image reverted to the first page.",
          [{ text: "OK" }],
        );
      }
    } catch {
      Alert.alert("Error", "Failed to update title page.");
    } finally {
      setTitlePageSaving(false);
    }
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
                  <View style={[s.modeIconWrap, active && s.modeIconWrapActive]}>
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

          {/* ── Tap zone hint ─────────────────────────────────────────────── */}
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

          {/* ── Autoplay ─────────────────────────────────────────────────── */}
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
                <SectionLabel icon="speedometer-outline" text="Seconds / page" />
                <View style={s.speedBadge}>
                  <Text style={s.speedBadgeText}>{autoPlaySpeed}s</Text>
                </View>
              </View>

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

              <View style={s.fineTune}>
                <TouchableOpacity onPress={() => bumpSpeed(-0.5)} style={s.fineTuneBtn}>
                  <MaterialCommunityIcons name="minus" size={20} color="#64748b" />
                </TouchableOpacity>
                <View style={s.fineTuneValue}>
                  <Text style={s.fineTuneValueText}>{autoPlaySpeed}s per page</Text>
                </View>
                <TouchableOpacity onPress={() => bumpSpeed(0.5)} style={s.fineTuneBtn}>
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

          {/* ── Set as Title Page ─────────────────────────────────────────── */}
          <View style={s.section}>
            <SectionLabel icon="image-edit-outline" text="Cover Image" />

            <TouchableOpacity
              activeOpacity={0.75}
              onPress={() => handleTitlePageToggle(!isTitlePage)}
              style={[s.titlePageRow, isTitlePage && s.titlePageRowActive]}
            >
              {/* Left side */}
              <View style={[s.titlePageIconWrap, isTitlePage && s.titlePageIconWrapActive]}>
                <MaterialCommunityIcons
                  name="format-title"
                  size={20}
                  color={isTitlePage ? "#38D926" : "#334155"}
                />
              </View>

              <View style={s.titlePageTextWrap}>
                <Text style={[s.titlePageLabel, isTitlePage && s.titlePageLabelActive]}>
                  Set as title page
                </Text>
                <Text style={s.titlePageSub}>
                  {isTitlePage
                    ? `Page ${currentPage + 1} · EP ${currentEp}`
                    : `Use page ${currentPage + 1} as the cover`}
                </Text>
              </View>

              {/* Checkbox */}
              <View style={[s.checkbox, isTitlePage && s.checkboxChecked]}>
                {isTitlePage && (
                  <MaterialCommunityIcons name="check" size={14} color="#000" />
                )}
              </View>
            </TouchableOpacity>

            {isTitlePage && (
              <TouchableOpacity
                onPress={() => handleTitlePageToggle(false)}
                style={s.clearTitleBtn}
                activeOpacity={0.7}
              >
                <MaterialCommunityIcons name="restore" size={13} color="#475569" />
                <Text style={s.clearTitleText}>Revert to default cover</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </View>
    </Modal>
  );
};

// ── Small reusable section header ─────────────────────────────────────────────

const SectionLabel = ({ icon, text }: { icon: string; text: string }) => (
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

  // ── Title page row
  titlePageRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0d1420",
    borderRadius: 14,
    padding: 14,
    gap: 12,
    borderWidth: 1,
    borderColor: "#141c2b",
  },
  titlePageRowActive: {
    backgroundColor: "#38D92610",
    borderColor: "#38D926",
  },
  titlePageIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: "#141c2b",
    justifyContent: "center",
    alignItems: "center",
  },
  titlePageIconWrapActive: {
    backgroundColor: "#38D92620",
  },
  titlePageTextWrap: {
    flex: 1,
  },
  titlePageLabel: {
    color: "#475569",
    fontSize: 13,
    fontWeight: "800",
  },
  titlePageLabelActive: {
    color: "#38D926",
  },
  titlePageSub: {
    color: "#334155",
    fontSize: 10,
    marginTop: 2,
  },

  // ── Checkbox
  checkbox: {
    width: 22,
    height: 22,
    borderRadius: 6,
    borderWidth: 2,
    borderColor: "#334155",
    backgroundColor: "transparent",
    justifyContent: "center",
    alignItems: "center",
  },
  checkboxChecked: {
    backgroundColor: "#38D926",
    borderColor: "#38D926",
  },

  // ── Clear title button
  clearTitleBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginTop: 10,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: "#0d1420",
    borderWidth: 1,
    borderColor: "#1e293b",
    alignSelf: "flex-start",
  },
  clearTitleText: {
    color: "#475569",
    fontSize: 11,
    fontWeight: "700",
  },
});