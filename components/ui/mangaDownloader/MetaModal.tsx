import React, { useEffect, useRef, useState } from "react";
import {
  Modal, View, Text, TextInput, TouchableOpacity,
  ScrollView, Switch, Animated, KeyboardAvoidingView, Platform,
} from "react-native";
import type { MangaMeta, EditedMeta, Phase } from "../../../services/downloader/types/manga";

// ─── Field ────────────────────────────────────────────────────────────────────

interface FieldProps {
  label:        string;
  value:        string;
  onChangeText: (v: string) => void;
  multiline?:   boolean;
  required?:    boolean;
  invalid?:     boolean;
  editable?:    boolean;
}

const Field = ({ label, value, onChangeText, multiline = false, required, invalid, editable = true }: FieldProps) => (
  <View className="mb-3">
    <Text className="text-xs text-gray-500 mb-1">
      {label}{required && <Text className="text-red-400"> *</Text>}
    </Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      editable={editable}
      className="bg-gray-50 border rounded-xl px-3 py-2 text-sm text-black"
      style={{
        minHeight:       multiline ? 56 : undefined,
        borderColor:     invalid   ? "#f87171" : "#e5e7eb",
        backgroundColor: editable  ? "#f9fafb" : "#f3f4f6",
      }}
      placeholderTextColor="#aaa"
    />
    {invalid && (
      <Text className="text-red-400 text-xs mt-0.5">Required</Text>
    )}
  </View>
);

// ─── MetaModal ────────────────────────────────────────────────────────────────

interface Props {
  visible:    boolean;
  meta:       MangaMeta | null;
  edited:     EditedMeta;
  phase:      Phase;
  onChange:   (key: keyof EditedMeta) => (v: string) => void;
  onDownload: () => void;
  onCancel:   () => void;
  onClose:    () => void;
}

export const MetaModal = ({ visible, meta, edited, phase, onChange, onDownload, onCancel, onClose }: Props) => {
  // ✅ Auto-save always starts OFF — user opts in manually
  const [autoSave, setAutoSave] = useState(false);
  const [touched,  setTouched]  = useState(false);
  const shakeAnim = useRef(new Animated.Value(0)).current;

  const isDownloading = phase === "downloading";
  const isDone        = phase === "done" || phase === "error";

  const nameOk = edited.name.trim().length > 0;
  const epOk   = edited.ep.trim().length   > 0;
  const canGo  = nameOk && epOk;

  // Reset state whenever a new lookup opens the modal
  useEffect(() => {
    if (visible && meta) {
      setAutoSave(false);  // always OFF on open
      setTouched(false);
    }
  }, [visible, meta?.source]);

  const shake = () => {
    Animated.sequence([
      Animated.timing(shakeAnim, { toValue:  8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue: -8, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  5, duration: 50, useNativeDriver: true }),
      Animated.timing(shakeAnim, { toValue:  0, duration: 50, useNativeDriver: true }),
    ]).start();
  };

  // Auto-save toggle:
  //   ON + fields complete   → start download
  //   ON + fields incomplete → reject, shake, highlight missing
  //   OFF                    → just turns off, shows manual button
  const handleAutoSaveToggle = (val: boolean) => {
    if (!val) { setAutoSave(false); return; }
    if (canGo) {
      setAutoSave(true);
      if (phase === "review") onDownload();
    } else {
      setTouched(true);
      shake();
      // toggle stays OFF
    }
  };

  const handleManualDownload = () => {
    if (!canGo) { setTouched(true); shake(); return; }
    onDownload();
  };

  if (!meta) return null;

  const sourceLabel =
    meta.source === "nhentai"    ? "nHentai"    :
    meta.source === "mangadex"   ? "MangaDex"   : "Sequential";

  // Fields are editable unless actively downloading
  const fieldsEditable = !isDownloading;

  const pageCount = meta.source === "sequential"
    ? "? pages"                        // unknown until scan runs
    : `${meta.imageUrls.length} pages`;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View className="flex-1 justify-end bg-black/40">
        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View className="bg-white rounded-t-3xl" style={{ maxHeight: "92%" }}>

            {/* Header */}
            <View className="flex-row justify-between items-center px-5 pt-5 pb-3 border-b border-gray-100">
              <View>
                <Text className="font-bold text-base text-black">
                  {sourceLabel} · {pageCount}
                </Text>
                <Text className="text-xs text-gray-400">
                  {meta.source === "nhentai"
                    ? "Auto-filled from nhentai — edit if needed"
                    : "Fill in the details to save"}
                </Text>
              </View>
              {!isDownloading && (
                <TouchableOpacity onPress={onClose} hitSlop={{ top: 10, right: 10, bottom: 10, left: 10 }}>
                  <Text className="text-gray-400 text-xl">✕</Text>
                </TouchableOpacity>
              )}
            </View>

            <ScrollView
              className="px-5 pt-4"
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: 32 }}
            >
              <Animated.View style={{ transform: [{ translateX: shakeAnim }] }}>

                <Field label="Name"                    value={edited.name}   onChangeText={onChange("name")}   required invalid={touched && !nameOk} editable={fieldsEditable} />
                <Field label="Episode / Chapter"       value={edited.ep}     onChangeText={onChange("ep")}     required invalid={touched && !epOk}   editable={fieldsEditable} />
                <Field label="Author"                  value={edited.author} onChangeText={onChange("author")}                                        editable={fieldsEditable} />
                <Field label="Tags (comma separated)"  value={edited.tags}   onChangeText={onChange("tags")}   multiline                              editable={fieldsEditable} />
                <Field label="Genres (comma separated)"value={edited.genres} onChangeText={onChange("genres")} multiline                              editable={fieldsEditable} />

                {/* Auto-save row */}
                <View className="flex-row items-center justify-between py-3 border-t border-gray-100 mt-1 mb-4">
                  <View className="flex-1 mr-4">
                    <Text className="text-sm font-semibold text-black">Auto save</Text>
                    <Text className="text-xs text-gray-400" numberOfLines={2}>
                      {autoSave
                        ? "Download starts automatically when fields are ready"
                        : "Press Download when ready"}
                    </Text>
                  </View>
                  <Switch
                    value={autoSave}
                    onValueChange={handleAutoSaveToggle}
                    disabled={isDownloading}
                    trackColor={{ false: "#d1d5db", true: "#38D926" }}
                    thumbColor="#fff"
                  />
                </View>

                {/* Action button */}
                {isDownloading ? (
                  <TouchableOpacity
                    onPress={onCancel}
                    className="bg-red-400 rounded-xl py-3 items-center"
                  >
                    <Text className="text-white font-bold">Cancel download</Text>
                  </TouchableOpacity>
                ) : !autoSave && !isDone && (
                  <TouchableOpacity
                    onPress={handleManualDownload}
                    className="rounded-xl py-3 items-center"
                    style={{ backgroundColor: canGo ? "#38D926" : "#d1d5db" }}
                  >
                    <Text className="text-white font-bold">
                      Download {meta.source !== "sequential" ? `${meta.imageUrls.length} pages` : ""}
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