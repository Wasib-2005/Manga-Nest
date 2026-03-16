import React from "react";
import { View, Text, TextInput, TouchableOpacity } from "react-native";
import type { MangaMeta, EditedMeta, Phase } from "../../../services/downloader/types/manga";

// ─── Field ────────────────────────────────────────────────────────────────────

interface FieldProps {
  label:        string;
  value:        string;
  onChangeText: (v: string) => void;
  multiline?:   boolean;
}

const Field = ({ label, value, onChangeText, multiline = false }: FieldProps) => (
  <View className="mb-3">
    <Text className="text-xs text-gray-500 mb-1">{label}</Text>
    <TextInput
      value={value}
      onChangeText={onChangeText}
      multiline={multiline}
      className="bg-gray-50 border border-gray-200 rounded-xl px-3 py-2 text-sm text-black"
      style={{ minHeight: multiline ? 64 : undefined }}
      placeholderTextColor="#aaa"
    />
  </View>
);

// ─── MetaForm ─────────────────────────────────────────────────────────────────

interface Props {
  meta:       MangaMeta;
  edited:     EditedMeta;
  phase:      Phase;
  onChange:   (key: keyof EditedMeta) => (v: string) => void;
  onDownload: () => void;
  onCancel:   () => void;
}

export const MetaForm = ({ meta, edited, phase, onChange, onDownload, onCancel }: Props) => {
  const canDownload = edited.name.trim().length > 0 && edited.ep.trim().length > 0;

  return (
    <View className="bg-white rounded-2xl p-4 mb-4 border border-gray-100">
      <View className="flex-row justify-between items-center mb-3">
        <Text className="font-bold text-base text-black">
          {meta.source === "nhentai" ? "nHentai" : "MangaDex"}
          {" · "}{meta.imageUrls.length} pages
        </Text>
        <Text className="text-xs text-gray-400">edit before download</Text>
      </View>

      <Field label="Name *"                   value={edited.name}   onChangeText={onChange("name")} />
      <Field label="Episode / Chapter *"      value={edited.ep}     onChangeText={onChange("ep")} />
      <Field label="Author"                   value={edited.author} onChangeText={onChange("author")} />
      <Field label="Tags (comma separated)"   value={edited.tags}   onChangeText={onChange("tags")}   multiline />
      <Field label="Genres (comma separated)" value={edited.genres} onChangeText={onChange("genres")} multiline />

      {phase === "review" && (
        <TouchableOpacity
          onPress={onDownload}
          disabled={!canDownload}
          className="bg-[#38D926] rounded-xl py-3 items-center mt-2"
          style={{ opacity: canDownload ? 1 : 0.4 }}
        >
          <Text className="text-white font-bold">Download {meta.imageUrls.length} pages</Text>
        </TouchableOpacity>
      )}

      {phase === "downloading" && (
        <TouchableOpacity
          onPress={onCancel}
          className="bg-red-400 rounded-xl py-3 items-center mt-2"
        >
          <Text className="text-white font-bold">Cancel</Text>
        </TouchableOpacity>
      )}
    </View>
  );
};