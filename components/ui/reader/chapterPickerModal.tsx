import React from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  ScrollView,
  FlatList,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ChapterInfo } from "../../../services/reader/libraryService";

interface Props {
  visible: boolean;
  chapters: ChapterInfo[];
  mangaName: string;
  onSelectChapter: (ep: string) => void;
  onClose: () => void;
}

export const ChapterPickerModal = ({
  visible,
  chapters,
  mangaName,
  onSelectChapter,
  onClose,
}: Props) => {
  const renderChapterItem = (item: ChapterInfo, index: number) => {
    const chapterNumber = parseInt(item.ep, 10);
    const isValidNumber = !isNaN(chapterNumber);

    return (
      <TouchableOpacity
        onPress={() => onSelectChapter(item.ep)}
        className="bg-gradient-to-r from-slate-800 to-slate-900 rounded-xl p-4 mb-2 border border-slate-700 active:opacity-70 flex-row items-center justify-between"
      >
        <View className="flex-1">
          <Text className="text-white font-bold text-base">
            {isValidNumber ? `Chapter ${item.ep}` : `Part ${item.ep}`}
          </Text>
          <Text className="text-xs text-slate-400 mt-1">
            {item.pages} pages • {new Date(item.savedAt).toLocaleDateString()}
          </Text>
        </View>

        <MaterialCommunityIcons
          name="chevron-right"
          size={24}
          color="#10b981"
        />
      </TouchableOpacity>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-black/40 justify-end">
        <View className="bg-gradient-to-b from-slate-950 to-gray-950 rounded-t-3xl max-h-4/5">
          {/* Header */}
          <View className="flex-row justify-between items-center px-6 py-5 border-b border-slate-800">
            <View className="flex-1">
              <Text className="text-white font-bold text-lg" numberOfLines={1}>
                {mangaName}
              </Text>
              <Text className="text-xs text-slate-400 mt-1">
                {chapters.length} chapter{chapters.length !== 1 ? "s" : ""}
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2">
              <MaterialCommunityIcons
                name="close"
                size={24}
                color="#94a3b8"
              />
            </TouchableOpacity>
          </View>

          {/* Chapters List */}
          <FlatList
            data={chapters}
            keyExtractor={(item, index) => `${item.ep}-${index}`}
            renderItem={({ item, index }) => renderChapterItem(item, index)}
            contentContainerStyle={{
              paddingHorizontal: 16,
              paddingVertical: 16,
              paddingBottom: 32,
            }}
            scrollEnabled={chapters.length > 5}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
};