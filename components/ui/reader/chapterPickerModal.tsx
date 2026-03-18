import React, { useMemo } from "react";
import { View, Text, Modal, TouchableOpacity, FlatList, Alert, StyleSheet } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import type { ChapterInfo } from "../../../services/reader/libraryService";

interface Props {
  visible: boolean;
  chapters: ChapterInfo[];
  mangaName: string;
  mangaUid: string;
  onSelectChapter: (ep: string) => void;
  onDeleteChapter: (ep: string) => void;
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
  
  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) => 
      a.ep.localeCompare(b.ep, undefined, { numeric: true, sensitivity: 'base' })
    );
  }, [chapters]);

  const confirmDelete = (ep: string) => {
    Alert.alert(
      "Delete Chapter",
      `Are you sure you want to delete ${isNaN(parseInt(ep)) ? 'Part' : 'Chapter'} ${ep}?`,
      [
        { text: "Cancel", style: "cancel" },
        { text: "Delete", style: "destructive", onPress: () => onDeleteChapter(ep) },
      ]
    );
  };

  const renderChapterItem = (item: ChapterInfo) => {
    const isValidNumber = !isNaN(parseInt(item.ep, 10));

    return (
      <View style={styles.chapterCard}>
        <TouchableOpacity
          onPress={() => onSelectChapter(item.ep)}
          style={styles.chapterMain}
          activeOpacity={0.7}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.chapterTitle}>
              {isValidNumber ? `Chapter ${item.ep}` : `Part ${item.ep}`}
            </Text>
            <Text style={styles.chapterSubtitle}>
              {item.pages} pages • {new Date(item.savedAt).toLocaleDateString()}
            </Text>
          </View>
          <MaterialCommunityIcons name="chevron-right" size={24} color="#38D926" />
        </TouchableOpacity>

        <View style={styles.divider} />

        <TouchableOpacity onPress={() => confirmDelete(item.ep)} style={styles.deleteBtn}>
          <MaterialCommunityIcons name="trash-can-outline" size={22} color="#ef4444" />
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      {/* 1. This TouchableOpacity allows tapping the background to close */}
      <TouchableOpacity 
        style={styles.backdrop} 
        activeOpacity={1} 
        onPress={onClose}
      >
        {/* 2. StopPropagation by wrapping inner content in a View or another TouchableWithoutFeedback */}
        <TouchableOpacity activeOpacity={1} style={styles.sheetContainer}>
          
          {/* Grab Bar (Visual indicator for sheet) */}
          <View style={styles.grabBar} />

          {/* Header */}
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mangaTitle} numberOfLines={1}>{mangaName}</Text>
              <Text style={styles.statsText}>{chapters.length} chapters downloaded</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color="#C7F4C2" />
            </TouchableOpacity>
          </View>

          {/* List */}
          <FlatList
            data={sortedChapters}
            keyExtractor={(item) => item.ep}
            renderItem={({ item }) => renderChapterItem(item)}
            contentContainerStyle={styles.listContent}
            showsVerticalScrollIndicator={false}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.7)',
    justifyContent: 'flex-end', // Crucial for docking at bottom
  },
  sheetContainer: {
    backgroundColor: "#052e16", 
    borderTopLeftRadius: 32, 
    borderTopRightRadius: 32, 
    maxHeight: '85%',
    width: '100%',
    paddingBottom: 20,
  },
  grabBar: {
    width: 40,
    height: 5,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderRadius: 3,
    alignSelf: 'center',
    marginTop: 12,
  },
  header: {
    flexDirection: 'row', 
    justifyContent: 'space-between', 
    alignItems: 'center', 
    paddingHorizontal: 24, 
    paddingVertical: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  mangaTitle: { color: "white", fontWeight: "900", fontSize: 20 },
  statsText: { color: "#4ade80", fontSize: 13, marginTop: 2, fontWeight: '600' },
  closeBtn: { padding: 4, backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: 20 },
  listContent: { padding: 16, paddingBottom: 40 },
  chapterCard: { 
    backgroundColor: "#022c22", 
    borderRadius: 16, 
    marginBottom: 10, 
    borderWidth: 1, 
    borderColor: "rgba(255,255,255,0.05)", 
    flexDirection: 'row', 
    alignItems: 'center',
    overflow: 'hidden'
  },
  chapterMain: { flex: 1, padding: 16, flexDirection: 'row', alignItems: 'center' },
  chapterTitle: { color: "white", fontWeight: "bold", fontSize: 16 },
  chapterSubtitle: { color: "#86efac", fontSize: 12, marginTop: 4 },
  divider: { width: 1, height: 40, backgroundColor: "rgba(255,255,255,0.05)" },
  deleteBtn: { padding: 16, justifyContent: 'center', alignItems: 'center' },
});

ChapterPickerModal.displayName = "ChapterPickerModal";