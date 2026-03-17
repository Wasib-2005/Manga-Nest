import React from "react";
import { View, Text, Modal, TouchableOpacity, FlatList, Alert } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ChapterInfo } from "../../../services/reader/libraryService";

interface Props {
  visible: boolean;
  chapters: ChapterInfo[];
  mangaName: string;
  mangaUid: string;
  onSelectChapter: (ep: string) => void;
  onDeleteChapter: (ep: string) => void; // New callback
  onClose: () => void;
}

export const ChapterPickerModal = ({
  visible,
  chapters,
  mangaName,
  onSelectChapter,
  onDeleteChapter,
  onClose,
}: Props) => {
  
  const confirmDelete = (ep: string) => {
    Alert.alert(
      "Delete Chapter",
      `Are you sure you want to delete Chapter ${ep}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDeleteChapter(ep) },
      ]
    );
  };

  const renderChapterItem = (item: ChapterInfo) => {
    const chapterNumber = parseInt(item.ep, 10);
    const isValidNumber = !isNaN(chapterNumber);

    return (
      <View className="bg-green-950 rounded-xl mb-2 border border-green-900 flex-row items-center">
        {/* Main selection area */}
        <TouchableOpacity
          onPress={() => onSelectChapter(item.ep)}
          className="flex-1 p-4 flex-row items-center justify-between"
          activeOpacity={0.7}
        >
          <View className="flex-1">
            <Text className="text-white font-bold text-base">
              {isValidNumber ? `Chapter ${item.ep}` : `Part ${item.ep}`}
            </Text>
            <Text className="text-xs text-green-300 mt-1">
              {item.pages} pages • {new Date(item.savedAt).toLocaleDateString()}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#38D926" />
        </TouchableOpacity>

        {/* Delete button separator */}
        <View className="w-[1px] h-8 bg-green-900" />

        {/* Delete action */}
        <TouchableOpacity 
          onPress={() => confirmDelete(item.ep)}
          className="p-4 justify-center items-center"
        >
          <MaterialCommunityIcons name="trash-can-outline" size={22} color="#ef4444" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-black/60 justify-end">
        <View className="bg-green-950 rounded-t-3xl max-h-[80%]">
          <View className="flex-row justify-between items-center px-6 py-5 border-b border-green-900">
            <View className="flex-1">
              <Text className="text-white font-bold text-lg" numberOfLines={1}>{mangaName}</Text>
              <Text className="text-xs text-green-400 mt-1">{chapters.length} downloaded</Text>
            </View>
            <TouchableOpacity onPress={onClose} className="p-2">
              <MaterialCommunityIcons name="close" size={24} color="#C7F4C2" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={chapters}
            keyExtractor={(item) => item.ep}
            renderItem={({ item }) => renderChapterItem(item)}
            contentContainerStyle={{ padding: 16, paddingBottom: 40 }}
            showsVerticalScrollIndicator={false}
          />
        </View>
      </View>
    </Modal>
  );
};