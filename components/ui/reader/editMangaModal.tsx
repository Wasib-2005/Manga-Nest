import React, { useState, useEffect } from "react";
import {
  Modal,
  View,
  Text,
  TextInput,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { type MangaEntry } from "../../../services/reader/libraryService";

interface Props {
  visible: boolean;
  manga: MangaEntry;
  onSave: (uid: string, data: Partial<MangaEntry>) => void;
  onClose: () => void;
}

export const EditMangaModal = ({ visible, manga, onSave, onClose }: Props) => {
  // 1. Initial State
  const [name, setName] = useState(manga?.name || "");
  const [author, setAuthor] = useState(manga?.author || "");
  const [tags, setTags] = useState((manga?.tags || []).join(", "));
  const [genres, setGenres] = useState((manga?.genres || []).join(", "));

  // 2. The "Nuclear" Sync: Forces the inputs to update if the manga prop changes
  useEffect(() => {
    if (manga) {
      setName(manga.name || "");
      setAuthor(manga.author || "");
      setTags((manga.tags || []).join(", "));
      setGenres((manga.genres || []).join(", "));
    }
  }, [manga]);

  const handleSave = () => {
    onSave(manga.uid, {
      name,
      author,
      tags: tags.split(",").map((t) => t.trim()).filter(Boolean),
      genres: genres.split(",").map((g) => g.trim()).filter(Boolean),
    });
  };

  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={styles.overlay}>
        <View style={styles.content}>
          <View style={styles.header}>
            <View>
              <Text style={styles.title}>Edit Metadata</Text>
              <Text style={styles.subtitle}>{manga.source.toUpperCase()} ID: {manga.uid}</Text>
            </View>
            <TouchableOpacity onPress={onClose} style={styles.closeBtn}>
              <MaterialCommunityIcons name="close" size={22} color="#475569" />
            </TouchableOpacity>
          </View>

          <ScrollView style={{ padding: 20 }} showsVerticalScrollIndicator={false}>
            <Text style={styles.label}>MANGA TITLE</Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="Manga Title"
              placeholderTextColor="#334155"
            />

            <Text style={styles.label}>AUTHOR</Text>
            <TextInput
              style={styles.input}
              value={author}
              onChangeText={setAuthor}
              placeholder="Author Name"
              placeholderTextColor="#334155"
            />

            <Text style={styles.label}>TAGS (COMMA SEPARATED)</Text>
            <TextInput
              style={[styles.input, { height: 80, textAlignVertical: "top" }]}
              value={tags}
              onChangeText={setTags}
              multiline
              placeholder="action, adventure, romance..."
              placeholderTextColor="#334155"
            />

            <Text style={styles.label}>GENRES</Text>
            <TextInput
              style={[styles.input, { height: 60, textAlignVertical: "top" }]}
              value={genres}
              onChangeText={setGenres}
              multiline
              placeholder="Shonen, Seinen..."
              placeholderTextColor="#334155"
            />

            <TouchableOpacity style={styles.saveBtn} onPress={handleSave} activeOpacity={0.8}>
              <Text style={styles.saveText}>Update Library</Text>
            </TouchableOpacity>
            <View style={{ height: 20 }} />
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
};

const styles = StyleSheet.create({
  overlay: { flex: 1, backgroundColor: "rgba(3, 7, 18, 0.95)", justifyContent: "center", padding: 20 },
  content: { backgroundColor: "#0a0e17", borderRadius: 24, borderWidth: 1, borderColor: "#1e293b", overflow: "hidden", maxHeight: '85%' },
  header: { flexDirection: "row", justifyContent: "space-between", padding: 20, borderBottomWidth: 1, borderBottomColor: "#141c2b", alignItems: 'center' },
  title: { color: "#f1f5f9", fontSize: 20, fontWeight: "900" },
  subtitle: { color: "#475569", fontSize: 10, fontWeight: "700", marginTop: 2 },
  closeBtn: { padding: 8, backgroundColor: '#030712', borderRadius: 12, borderWidth: 1, borderColor: '#1e293b' },
  label: { color: "#38D926", fontSize: 10, fontWeight: "900", marginBottom: 8, marginTop: 15, letterSpacing: 1 },
  input: { backgroundColor: "#030712", borderRadius: 14, padding: 14, color: "#f1f5f9", borderWidth: 1, borderColor: "#1e293b", fontSize: 15 },
  saveBtn: { backgroundColor: "#38D926", padding: 16, borderRadius: 16, marginTop: 30, alignItems: "center" },
  saveText: { color: "#030712", fontWeight: "900", fontSize: 16 },
});