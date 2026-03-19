import React, { useMemo, useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  FlatList,
  Alert,
  StyleSheet,
  Image,
  Dimensions,
  TextInput,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  getFirstPageUri,
  type ChapterInfo,
} from "../../../services/reader/libraryService";

const SCREEN_WIDTH = Dimensions.get("window").width;
const COLUMN_SPACING = 16;
const CARD_WIDTH = (SCREEN_WIDTH - COLUMN_SPACING * 3) / 2;

const ChapterThumbnail = ({ uid, ep }: { uid: string; ep: string }) => {
  const [uri, setUri] = useState<string | null>(null);
  useEffect(() => {
    getFirstPageUri(uid, ep).then(setUri);
  }, [uid, ep]);

  if (!uri)
    return (
      <View style={styles.placeholderContainer}>
        <MaterialCommunityIcons
          name="image-outline"
          size={32}
          color="rgba(255,255,255,0.1)"
        />
      </View>
    );

  return (
    <Image
      source={{ uri: `file://${uri}` }}
      style={styles.chapterImage}
      resizeMode="contain"
    />
  );
};

interface ChapterPickerModalProps {
  visible: boolean;
  chapters: ChapterInfo[];
  mangaName: string;
  mangaUid: string;
  onSelectChapter: (ep: string) => void;
  onDeleteChapter: (ep: string) => void;
  onRenameChapter: (oldEp: string, newEp: string) => void;
  onClose: () => void;
}

export const ChapterPickerModal = ({
  visible,
  chapters,
  mangaName,
  mangaUid,
  onSelectChapter,
  onDeleteChapter,
  onRenameChapter,
  onClose,
}: ChapterPickerModalProps) => {
  const [renamingEp, setRenamingEp] = useState<string | null>(null);
  const [newEpValue, setNewEpValue] = useState("");

  const sortedChapters = useMemo(() => {
    return [...chapters].sort((a, b) =>
      a.ep.localeCompare(b.ep, undefined, { numeric: true }),
    );
  }, [chapters]);

  const renderChapterItem = ({ item }: { item: ChapterInfo }) => {
    const isRenaming = renamingEp === item.ep;

    return (
      <View style={styles.chapterCard}>
        <TouchableOpacity
          activeOpacity={0.8}
          style={{ flex: 1 }}
          onPress={() => onSelectChapter(item.ep)}
        >
          <View style={styles.imageWrapper}>
            <ChapterThumbnail uid={mangaUid} ep={item.ep} />
            <View style={styles.epBadge}>
              <Text style={styles.epBadgeText}>{item.ep}</Text>
            </View>
          </View>
        </TouchableOpacity>

        <View style={styles.infoContainer}>
          {isRenaming ? (
            <TextInput
              style={styles.renameInput}
              value={newEpValue}
              onChangeText={setNewEpValue}
              autoFocus
              onBlur={() => {
                if (newEpValue && newEpValue !== item.ep) {
                  onRenameChapter(item.ep, newEpValue);
                }
                setRenamingEp(null);
              }}
            />
          ) : (
            <Text style={styles.chapterTitle} numberOfLines={1}>
              EP {item.ep}
            </Text>
          )}

          <View style={styles.metaRow}>
            <Text style={styles.chapterSubtitle}>{item.pages} pgs</Text>
            <View style={{ flexDirection: "row", gap: 12 }}>
              <TouchableOpacity
                onPress={() => {
                  setRenamingEp(item.ep);
                  setNewEpValue(item.ep);
                }}
              >
                <MaterialCommunityIcons
                  name="pencil-outline"
                  size={16}
                  color="#94a3b8"
                />
              </TouchableOpacity>
              <TouchableOpacity onPress={() => onDeleteChapter(item.ep)}>
                <MaterialCommunityIcons
                  name="trash-can-outline"
                  size={16}
                  color="#ef4444"
                />
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </View>
    );
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.backdrop}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} style={styles.sheetContainer}>
          <View style={styles.grabBar} />
          <View style={styles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mangaTitle} numberOfLines={1}>
                {mangaName}
              </Text>
              <Text style={styles.statsText}>
                {chapters.length} items downloaded
              </Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={24} color="#C7F4C2" />
            </TouchableOpacity>
          </View>

          <FlatList
            data={sortedChapters}
            keyExtractor={(item) => item.ep}
            renderItem={renderChapterItem}
            numColumns={2}
            columnWrapperStyle={styles.columnWrapper}
            contentContainerStyle={styles.listContent}
          />
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
};

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.85)",
    justifyContent: "flex-end",
  },
  sheetContainer: {
    backgroundColor: "#052e16",
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    maxHeight: "88%",
    width: "100%",
  },
  grabBar: {
    width: 40,
    height: 4,
    backgroundColor: "rgba(255,255,255,0.2)",
    borderRadius: 2,
    alignSelf: "center",
    marginTop: 12,
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 24,
    paddingVertical: 20,
  },
  mangaTitle: { color: "white", fontWeight: "900", fontSize: 18 },
  statsText: {
    color: "#4ade80",
    fontSize: 12,
    marginTop: 2,
    fontWeight: "600",
  },
  closeBtn: {
    padding: 6,
    backgroundColor: "rgba(255,255,255,0.05)",
    borderRadius: 20,
  },
  listContent: { padding: COLUMN_SPACING, paddingBottom: 60 },
  columnWrapper: { justifyContent: "space-between" },
  chapterCard: {
    width: CARD_WIDTH,
    backgroundColor: "#022c22",
    borderRadius: 14,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: "rgba(255,255,255,0.1)",
    overflow: "hidden",
  },
  imageWrapper: {
    width: "100%",
    aspectRatio: 0.75,
    backgroundColor: "#011a14",
    justifyContent: "center",
  },
  chapterImage: { width: "100%", height: "100%" },
  placeholderContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  epBadge: {
    position: "absolute",
    top: 8,
    right: 8,
    backgroundColor: "rgba(0,0,0,0.7)",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 6,
  },
  epBadgeText: { color: "#38D926", fontSize: 10, fontWeight: "800" },
  infoContainer: { padding: 10 },
  chapterTitle: {
    color: "white",
    fontWeight: "700",
    fontSize: 14,
    marginBottom: 4,
  },
  renameInput: {
    color: "#38D926",
    borderBottomWidth: 1,
    borderColor: "#38D926",
    padding: 0,
    fontSize: 14,
    fontWeight: "700",
    marginBottom: 4,
  },
  metaRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  chapterSubtitle: { color: "#86efac", fontSize: 11, opacity: 0.8 },
});
