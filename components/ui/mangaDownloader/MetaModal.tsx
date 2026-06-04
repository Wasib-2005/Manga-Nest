import React, { useEffect, useRef, useState, useCallback } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Animated,
  KeyboardAvoidingView,
  Platform,
  Image,
  ActivityIndicator,
  StyleSheet,
  Dimensions,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type {
  MangaMeta,
  EditedMeta,
  Phase,
} from "../../../services/downloader/types/manga";

const { width: SW } = Dimensions.get("window");

// ─── Cover image fetcher ──────────────────────────────────────────────────────
// Tries to pull the first image URL from meta, or scrapes the og:image from
// the source page if meta doesn't carry one directly.

function useCoverImage(meta: MangaMeta | null): string | null {
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    setUri(null);
    if (!meta) return;

    // Best case: meta already has imageUrls (mangadex / sequential)
    if (meta.imageUrls && meta.imageUrls.length > 0) {
      setUri(meta.imageUrls[0]);
      return;
    }

    // Fallback: try to fetch og:image from the source URL
    if (!meta.scanUrl) return;
    let cancelled = false;

    (async () => {
      console.log(
        meta.scanUrl,
        "doesn't have direct image URLs, attempting to scrape cover from page…",
      );
      try {
        const res = await fetch(meta.scanUrl, {
          headers: { "User-Agent": "Mozilla/5.0" },
        });
        console.log("Page fetch status:", res);

        if (typeof res === "object" && "status" in res && res.status <= 300) {
          return setUri(res.url);
        }

        const html = await res.text();

        console.log("Fetched HTML length:", html);
        // html is a object then

        // og:image
        const og = html.match(/og:image[^>]*content="([^"]+)"/);
        console.log("OG image found:", og && og[1]);
        // first <img src>
        const img = html.match(
          /<img[^>]+src="(https?:\/\/[^"]+\.(jpg|jpeg|png|webp)[^"]*)"/i,
        );
        if (img && img[1] && !cancelled) setUri(img[1]);
        if (og && og[1] && !cancelled) {
          setUri(og[1]);
          return;
        }
        // twitter:image
        const tw = html.match(/twitter:image[^>]*content="([^"]+)"/);
        if (tw && tw[1] && !cancelled) {
          setUri(tw[1]);
          return;
        }
      } catch {
        // silently ignore
        console.log("Failed to fetch or parse page for cover image.");
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [meta]);

  return uri;
}

// ─── Field ────────────────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  required?: boolean;
  invalid?: boolean;
  editable?: boolean;
  action?: { label: string; icon: string; onPress: () => void };
}

const Field = ({
  label,
  value,
  onChangeText,
  multiline,
  required,
  invalid,
  editable = true,
  action,
}: FieldProps) => (
  <View style={s.fieldWrap}>
    <View style={s.fieldHeader}>
      <Text style={s.fieldLabel}>
        {label}
        {required && <Text style={{ color: "#ef4444" }}> *</Text>}
      </Text>
      {action && editable && (
        <TouchableOpacity onPress={action.onPress} style={s.fieldAction}>
          <MaterialCommunityIcons
            name={action.icon as any}
            size={11}
            color="#38D926"
          />
          <Text style={s.fieldActionText}>{action.label}</Text>
        </TouchableOpacity>
      )}
    </View>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      editable={editable}
      placeholderTextColor="#334155"
      selectionColor="#38D926"
      style={[
        s.fieldInput,
        multiline && s.fieldInputMulti,
        invalid && s.fieldInputInvalid,
        !editable && s.fieldInputDisabled,
      ]}
    />
  </View>
);

// ─── Source badge ─────────────────────────────────────────────────────────────

const SOURCE_META: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  nhentai: { label: "nHentai", color: "#f97316", bg: "#f9731615" },
  mangadex: { label: "MangaDex", color: "#3b82f6", bg: "#3b82f615" },
  sequential: { label: "Sequential", color: "#a855f7", bg: "#a855f715" },
};

// ─── Main modal ───────────────────────────────────────────────────────────────

interface Props {
  visible: boolean;
  meta: MangaMeta | null;
  edited: EditedMeta;
  phase: Phase;
  onChange: (key: keyof EditedMeta) => (v: string) => void;
  onDownload: () => void;
  onCancel: () => void;
  onClose: () => void;
}

export const MetaModal = ({
  visible,
  meta,
  edited,
  phase,
  onChange,
  onDownload,
  onCancel,
  onClose,
}: Props) => {
  const [autoDownload, setAutoDownload] = useState(false);
  const [touched, setTouched] = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;



  const coverUri = useCoverImage(meta);

  const [imgLoading, setImgLoading] = useState(true);
  const [imgError, setImgError] = useState(false);

  const isDownloading = phase === "downloading";
  const nameOk = edited.name.trim().length > 0;
  const epOk = edited.ep.trim().length > 0;
  const canGo = nameOk && epOk;

  // Reset state when modal opens
  useEffect(() => {
    if (visible) {
      setAutoDownload(false);
      setTouched(false);
      setImgLoading(true);
      setImgError(false);
    }
  }, [visible]);

  // Auto-download trigger
  useEffect(() => {
    if (autoDownload && canGo && phase === "review") onDownload();
  }, [edited.name, edited.ep, autoDownload,onDownload, canGo, phase]);

  const shake = useCallback(() => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 45,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 45,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 8,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 40,
        useNativeDriver: true,
      }),
    ]).start();
  }, [shakeAnim]);

  const handleFormatTags = () => {
    if (!edited.tags) return;
    let clean = edited.tags
      .toLowerCase()
      .replace(/\btag:\s*/g, "")
      .replace(/\btag\s+/g, " ")
      .replace(/\b\d+(\.\d+)?[a-z]*\b/g, "");
    const words = clean.match(/[a-z]+(-[a-z]+)*/g);
    if (words) {
      const unique = Array.from(new Set(words)).filter((t) => t.length > 1);
      onChange("tags")(unique.join(", "));
    } else {
      onChange("tags")("");
    }
  };

  const handleAction = () => {
    if (isDownloading) {
      onCancel();
      return;
    }
    if (!canGo) {
      setTouched(true);
      shake();
      setAutoDownload(true);
      return;
    }
    onDownload();
  };

  if (!meta) return null;

  const src = SOURCE_META[meta.source] ?? {
    label: meta.source,
    color: "#64748b",
    bg: "#64748b15",
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View style={s.backdrop}>
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={{ width: "100%" }}
        >
          <View style={s.sheet}>
            {/* ── Grab bar ── */}
            <View style={s.grabRow}>
              <View style={s.grabBar} />
            </View>

            {/* ── Header ── */}
            <View style={s.header}>
              <View style={s.headerLeft}>
                <View
                  style={[
                    s.srcBadge,
                    { backgroundColor: src.bg, borderColor: src.color + "40" },
                  ]}
                >
                  <Text style={[s.srcBadgeText, { color: src.color }]}>
                    {src.label}
                  </Text>
                </View>
                <View>
                  <Text style={s.headerTitle}>
                    Manga <Text style={{ color: "#38D926" }}>Nest</Text>
                  </Text>
                  <Text style={s.headerSub}>Metadata Verification</Text>
                </View>
              </View>
              {!isDownloading && (
                <TouchableOpacity onPress={onClose} style={s.closeBtn}>
                  <MaterialCommunityIcons
                    name="close"
                    size={18}
                    color="#475569"
                  />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={s.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
                {/* ── Cover image ── */}
                {coverUri ? (
                  <View style={s.coverWrap}>
                    {imgLoading && !imgError && (
                      <View style={s.coverPlaceholder}>
                        <ActivityIndicator color="#38D926" />
                        <Text style={s.coverLoadingText}>Loading cover…</Text>
                      </View>
                    )}
                    {imgError && (
                      <View style={s.coverPlaceholder}>
                        <MaterialCommunityIcons
                          name="image-broken-variant"
                          size={32}
                          color="#1e293b"
                        />
                        <Text style={s.coverErrorText}>No preview</Text>
                      </View>
                    )}
                    <View style={s.coverWrap}>
                      <Image
                        source={{ uri: coverUri }}
                        style={[
                          s.coverImg,
                          (imgLoading || imgError) && { opacity: 0 },
                        ]}
                        className=""
                        resizeMode="cover"
                        onLoad={() => setImgLoading(false)}
                        onError={() => {
                          setImgError(true);
                          setImgLoading(false);
                        }}
                      />
                    </View>
                    {/* Gradient overlay at the bottom */}
                    <View style={s.coverGradient} pointerEvents="none" />
                    {/* Page count badge */}
                    {meta.imageUrls && meta.imageUrls.length > 0 && (
                      <View style={s.coverBadge}>
                        <MaterialCommunityIcons
                          name="image-multiple"
                          size={11}
                          color="#38D926"
                        />
                        <Text style={s.coverBadgeText}>
                          {meta.imageUrls.length} pages
                        </Text>
                      </View>
                    )}
                  </View>
                ) : (
                  <View style={s.coverNone}>
                    <MaterialCommunityIcons
                      name="book-open-page-variant"
                      size={40}
                      color="#1e293b"
                    />
                    <Text style={s.coverNoneText}>No cover available</Text>
                  </View>
                )}

                {/* ── Fields ── */}
                <View style={s.fields}>
                  <Field
                    label="Manga Title"
                    value={edited.name}
                    onChangeText={onChange("name")}
                    required
                    invalid={touched && !nameOk}
                    editable={!isDownloading}
                  />
                  <Field
                    label="Chapter / Episode"
                    value={edited.ep}
                    onChangeText={onChange("ep")}
                    required
                    invalid={touched && !epOk}
                    editable={!isDownloading}
                  />
                  <Field
                    label="Author"
                    value={edited.author}
                    onChangeText={onChange("author")}
                    editable={!isDownloading}
                  />
                  <Field
                    label="Tags"
                    value={edited.tags}
                    onChangeText={onChange("tags")}
                    multiline
                    editable={!isDownloading}
                    action={{
                      label: "Format",
                      icon: "auto-fix",
                      onPress: handleFormatTags,
                    }}
                  />
                </View>

                {/* ── Action button ── */}
                <TouchableOpacity
                  onPress={handleAction}
                  activeOpacity={0.8}
                  style={[
                    s.actionBtn,
                    isDownloading && s.actionBtnCancel,
                    autoDownload && !canGo && s.actionBtnWaiting,
                    !isDownloading &&
                      canGo &&
                      !autoDownload &&
                      s.actionBtnReady,
                  ]}
                >
                  <MaterialCommunityIcons
                    name={
                      isDownloading
                        ? "stop-circle"
                        : autoDownload && !canGo
                          ? "clock-outline"
                          : "download"
                    }
                    size={18}
                    color={
                      isDownloading
                        ? "#ef4444"
                        : autoDownload && !canGo
                          ? "#38D926"
                          : "#030712"
                    }
                    style={{ marginRight: 8 }}
                  />
                  <Text
                    style={[
                      s.actionBtnText,
                      (isDownloading || (autoDownload && !canGo)) &&
                        s.actionBtnTextAlt,
                      isDownloading && { color: "#ef4444" },
                    ]}
                  >
                    {isDownloading
                      ? "Cancel Download"
                      : autoDownload && !canGo
                        ? "Waiting for fields…"
                        : "Start Download"}
                  </Text>
                </TouchableOpacity>

                {/* ── Auto-download toggle ── */}
                {!isDownloading && (
                  <TouchableOpacity
                    onPress={() => setAutoDownload((p) => !p)}
                    style={s.autoToggle}
                  >
                    <View
                      style={[
                        s.autoToggleDot,
                        autoDownload && s.autoToggleDotOn,
                      ]}
                    />
                    <Text
                      style={[
                        s.autoToggleText,
                        autoDownload && s.autoToggleTextOn,
                      ]}
                    >
                      Auto-Download {autoDownload ? "On" : "Off"}
                    </Text>
                  </TouchableOpacity>
                )}
              </Animated.View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};

// ─── Styles ───────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
    alignItems: "center",
  },
  sheet: {
    width: "100%",
    backgroundColor: "#030712",
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderTopWidth: 1,
    borderColor: "#141c2b",
    maxHeight: "93%",
    shadowColor: "#38D926",
    shadowOffset: { width: 0, height: -6 },
    shadowOpacity: 0.06,
    shadowRadius: 24,
    elevation: 24,
  },
  grabRow: {
    alignItems: "center",
    paddingTop: 12,
    paddingBottom: 6,
  },
  grabBar: {
    width: 38,
    height: 4,
    borderRadius: 2,
    backgroundColor: "#1e293b",
  },

  // Header
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: "#0a0e17",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
  },
  headerTitle: {
    color: "#f1f5f9",
    fontSize: 17,
    fontWeight: "900",
    letterSpacing: -0.3,
  },
  headerSub: {
    color: "#334155",
    fontSize: 9,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 1.2,
    marginTop: 1,
  },
  srcBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
  },
  srcBadgeText: {
    fontSize: 10,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  closeBtn: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: "#0a0e17",
    borderWidth: 1,
    borderColor: "#1e293b",
    justifyContent: "center",
    alignItems: "center",
  },

  scrollContent: {
    paddingBottom: 44,
  },

  // Cover image
  coverWrap: {
    width: "100%",
    height: 200,
    backgroundColor: "#0a0e17",
    position: "relative",
    overflow: "hidden",
  },
  coverImg: {
  height: "100%",
  width: "100%",
  objectFit: "contain",
},
  coverPlaceholder: {
    position: "absolute",
    inset: 0,
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    zIndex: 1,
  },
  coverLoadingText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "600",
  },
  coverErrorText: {
    color: "#334155",
    fontSize: 11,
    fontWeight: "600",
  },
  coverGradient: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    height: 80,
    // simulate a gradient fade
    backgroundColor: "transparent",
    borderBottomWidth: 0,
    // We use a pseudo-gradient via a semi-transparent overlay
  },
  coverBadge: {
    position: "absolute",
    bottom: 10,
    right: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "rgba(3,7,18,0.85)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "#38D92640",
  },
  coverBadgeText: {
    color: "#38D926",
    fontSize: 10,
    fontWeight: "800",
  },
  coverNone: {
    width: "100%",
    height: 110,
    backgroundColor: "#060b14",
    justifyContent: "center",
    alignItems: "center",
    gap: 8,
    borderBottomWidth: 1,
    borderBottomColor: "#0f172a",
  },
  coverNoneText: {
    color: "#1e293b",
    fontSize: 12,
    fontWeight: "600",
  },

  // Fields
  fields: {
    paddingHorizontal: 20,
    paddingTop: 20,
    gap: 4,
  },
  fieldWrap: {
    marginBottom: 14,
  },
  fieldHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 6,
  },
  fieldLabel: {
    color: "#475569",
    fontSize: 10,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  fieldAction: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    backgroundColor: "#38D92612",
    borderWidth: 1,
    borderColor: "#38D92630",
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 6,
  },
  fieldActionText: {
    color: "#38D926",
    fontSize: 9,
    fontWeight: "800",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  fieldInput: {
    backgroundColor: "#0a0e17",
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: "#f1f5f9",
    fontSize: 14,
    fontWeight: "500",
    borderWidth: 1,
    borderColor: "#1e293b",
  },
  fieldInputMulti: {
    minHeight: 80,
    textAlignVertical: "top",
  },
  fieldInputInvalid: {
    borderColor: "#ef4444",
    backgroundColor: "#ef444408",
  },
  fieldInputDisabled: {
    backgroundColor: "#060b14",
    color: "#475569",
  },

  // Action button
  actionBtn: {
    marginHorizontal: 20,
    marginTop: 8,
    paddingVertical: 16,
    borderRadius: 16,
    flexDirection: "row",
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "#38D926",
  },
  actionBtnReady: {
    backgroundColor: "#38D926",
  },
  actionBtnCancel: {
    backgroundColor: "#ef444418",
    borderWidth: 1,
    borderColor: "#ef4444",
  },
  actionBtnWaiting: {
    backgroundColor: "#38D92612",
    borderWidth: 1,
    borderColor: "#38D92640",
  },
  actionBtnText: {
    color: "#030712",
    fontSize: 13,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 1,
  },
  actionBtnTextAlt: {
    color: "#38D926",
  },

  // Auto-download toggle
  autoToggle: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginTop: 14,
    paddingBottom: 4,
  },
  autoToggleDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#1e293b",
    borderWidth: 1,
    borderColor: "#334155",
  },
  autoToggleDotOn: {
    backgroundColor: "#38D926",
    borderColor: "#38D926",
  },
  autoToggleText: {
    color: "#334155",
    fontSize: 10,
    fontWeight: "700",
    textTransform: "uppercase",
    letterSpacing: 0.8,
  },
  autoToggleTextOn: {
    color: "#38D926",
  },
});
