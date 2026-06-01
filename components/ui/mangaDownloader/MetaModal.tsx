import React, { useEffect, useRef, useState } from "react";
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
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type {
  MangaMeta,
  EditedMeta,
  Phase,
} from "../../../services/downloader/types/manga";

// ─── Field Component ─────────────────────────────────────────────────────────

interface FieldProps {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  multiline?: boolean;
  required?: boolean;
  invalid?: boolean;
  editable?: boolean;
  onFormatTags?: () => void;
}

const Field = ({
  label,
  value,
  onChangeText,
  multiline,
  required,
  invalid,
  editable,
  onFormatTags,
}: FieldProps) => (
  <View className="mb-4">
    <View className="flex-row justify-between items-center mb-1.5">
      <Text className="text-[11px] font-bold text-[#475569] uppercase tracking-wider">
        {label}
        {required && <Text className="text-red-500"> *</Text>}
      </Text>

      {/* Inline Format Trigger for Tags */}
      {onFormatTags && editable && (
        <TouchableOpacity
          onPress={onFormatTags}
          activeOpacity={0.7}
          className="bg-[#1e293b]/50 border border-[#334155] px-2.5 py-0.5 rounded-md flex-row items-center"
        >
          <MaterialCommunityIcons
            name="auto-fix"
            size={12}
            color="#38D926"
            style={{ marginRight: 4 }}
          />
          <Text className="text-[#38D926] text-[10px] font-bold uppercase tracking-wider">
            Format
          </Text>
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
      className="rounded-xl px-4 py-3 text-sm text-[#f1f5f9] border"
      style={{
        minHeight: multiline ? 80 : undefined,
        borderColor: invalid ? "#ef4444" : "#1e293b",
        backgroundColor: editable ? "#0a0e17" : "#030712",
        textAlignVertical: multiline ? "top" : "center",
      }}
    />
  </View>
);

// ─── Main Modal ──────────────────────────────────────────────────────────────

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

  const isDownloading = phase === "downloading";
  const nameOk = edited.name.trim().length > 0;
  const epOk = edited.ep.trim().length > 0;
  const canGo = nameOk && epOk;

  // Powerful Clean/Format Parser for Tags
  const handleFormatTags = () => {
    if (!edited.tags) return;

    // 1. Force lowercase and globally clear explicitly isolated words like "tag:" or "tag"
    // This catches them anywhere in the string before we parse individual tags.
    let cleanString = edited.tags
      .toLowerCase()
      .replace(/\btag:\s*/g, "")
      .replace(/\btag\s+/g, " ");

    // 2. Erase all instances of numbers with their metric suffixes (e.g., 12, 12.4k, 23m)
    cleanString = cleanString.replace(/\b\d+(\.\d+)?[a-z]*\b/g, "");

    // 3. Match all remaining standalone alphabetical words/phrases
    // This extracts pure text groupings and ignores stray symbols or spaces.
    const wordMatches = cleanString.match(/[a-z]+(-[a-z]+)*/g);

    if (wordMatches) {
      // 4. Remove duplicate entries and join them beautifully with proper comma spacing
      const uniqueTags = Array.from(new Set(wordMatches)).filter(
        (tag) => tag.length > 1,
      ); // Ignore single characters

      onChange("tags")(uniqueTags.join(", "));
    } else {
      onChange("tags")(""); // Fallback if everything was wiped out
    }
  };

  // Trigger download if auto-download is toggled ON and fields become valid
  useEffect(() => {
    if (autoDownload && canGo && phase === "review") {
      onDownload();
    }
  }, [edited.name, edited.ep, autoDownload]);

  useEffect(() => {
    if (visible) {
      setAutoDownload(false);
      setTouched(false);
    }
  }, [visible]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: -10,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 10,
        duration: 40,
        useNativeDriver: true,
      }),
      Animated.timing(shakeAnim, {
        toValue: 0,
        duration: 40,
        useNativeDriver: true,
      }),
    ]).start();
  };

  const handleActionPress = () => {
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
  const sourceLabel =
    meta.source === "nhentai"
      ? "nHentai"
      : meta.source === "mangadex"
        ? "MangaDex"
        : "Sequential";

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onRequestClose={onClose}
    >
      <View className="flex-1 justify-end bg-black/80">
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
        >
          <View
            className="bg-[#030712] rounded-t-[32px] border-t border-[#1e293b]"
            style={{ maxHeight: "92%" }}
          >
            {/* Header */}
            <View className="flex-row justify-between items-center px-6 pt-6 pb-4 border-b border-[#0a0e17]">
              <View>
                <Text className="font-black text-lg text-[#f1f5f9] uppercase italic tracking-tighter">
                  {sourceLabel} <Text className="text-[#38D926]">NEST</Text>
                </Text>
                <Text className="text-[10px] text-[#475569] font-bold uppercase tracking-widest mt-0.5">
                  Metadata Verification
                </Text>
              </View>
              {!isDownloading && (
                <TouchableOpacity
                  onPress={onClose}
                  className="bg-[#0a0e17] p-2 rounded-full border border-[#1e293b]"
                >
                  <MaterialCommunityIcons
                    name="close"
                    size={20}
                    color="#475569"
                  />
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              className="px-6 pt-5"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 40 }}
            >
              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>
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
                  onFormatTags={handleFormatTags}
                />

                {/* Single Contextual Action Button */}
                <View className="mt-4">
                  <TouchableOpacity
                    onPress={handleActionPress}
                    activeOpacity={0.8}
                    className="rounded-2xl py-4 flex-row justify-center items-center border"
                    style={{
                      backgroundColor: isDownloading
                        ? "#ef444420"
                        : autoDownload && !canGo
                          ? "#38D92610"
                          : "#38D926",
                      borderColor: isDownloading
                        ? "#ef4444"
                        : autoDownload && !canGo
                          ? "#38D926"
                          : "transparent",
                    }}
                  >
                    <MaterialCommunityIcons
                      name={
                        isDownloading
                          ? "stop-circle"
                          : autoDownload && !canGo
                            ? "clock-outline"
                            : "download"
                      }
                      size={20}
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
                      style={{
                        color: isDownloading
                          ? "#ef4444"
                          : autoDownload && !canGo
                            ? "#38D926"
                            : "#030712",
                      }}
                      className="font-black uppercase tracking-widest text-xs"
                    >
                      {isDownloading
                        ? "Cancel Download"
                        : autoDownload && !canGo
                          ? "Waiting for fields..."
                          : "Start Download"}
                    </Text>
                  </TouchableOpacity>

                  {/* Manual Toggle Hint */}
                  {!isDownloading && (
                    <TouchableOpacity
                      onPress={() => setAutoDownload(!autoDownload)}
                      className="mt-4 items-center"
                    >
                      <Text
                        className="text-[10px] font-bold tracking-widest uppercase"
                        style={{ color: autoDownload ? "#38D926" : "#475569" }}
                      >
                        Auto-Download: {autoDownload ? "Enabled" : "Disabled"}
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              </Animated.View>
            </ScrollView>
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
};
