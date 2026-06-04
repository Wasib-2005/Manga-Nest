import React from "react";
import {
  View, TextInput, TouchableOpacity, Text,
  ActivityIndicator, StyleSheet,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";

interface Props {
  value:    string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading:  boolean;
}

export const UrlInput = ({ value, onChange, onSubmit, onCancel, loading }: Props) => (
  <View style={s.row}>
    <View style={s.inputWrap}>
      <MaterialCommunityIcons name="link-variant" size={15} color="#334155" style={s.icon} />
      <TextInput
        value={value}
        onChangeText={onChange}
        placeholder="Manga URL or chapter link…"
        placeholderTextColor="#334155"
        autoCapitalize="none"
        autoCorrect={false}
        onSubmitEditing={onSubmit}
        returnKeyType="search"
        editable={!loading}
        style={s.input}
      />
      {value.length > 0 && !loading && (
        <TouchableOpacity onPress={() => onChange("")} hitSlop={8}>
          <MaterialCommunityIcons name="close-circle" size={15} color="#334155" />
        </TouchableOpacity>
      )}
    </View>
    {loading ? (
      <TouchableOpacity onPress={onCancel} style={s.cancelBtn}>
        <ActivityIndicator color="#ef4444" size="small" />
      </TouchableOpacity>
    ) : (
      <TouchableOpacity onPress={onSubmit} style={s.lookupBtn} activeOpacity={0.8}>
        <MaterialCommunityIcons name="magnify" size={16} color="#030712" />
        <Text style={s.lookupText}>Look up</Text>
      </TouchableOpacity>
    )}
  </View>
);

const s = StyleSheet.create({
  row: { flexDirection: "row", gap: 8, marginBottom: 20 },
  inputWrap: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#0a0e17",
    borderRadius: 14,
    borderWidth: 1,
    borderColor: "#1e293b",
    paddingHorizontal: 12,
    paddingVertical: 11,
    gap: 8,
  },
  icon: { opacity: 0.6 },
  input: {
    flex: 1,
    color: "#f1f5f9",
    fontSize: 13,
    fontWeight: "500",
    padding: 0,
  },
  lookupBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: "#38D926",
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 11,
  },
  lookupText: {
    color: "#030712",
    fontSize: 12,
    fontWeight: "900",
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  cancelBtn: {
    backgroundColor: "#ef444418",
    borderWidth: 1,
    borderColor: "#ef4444",
    borderRadius: 14,
    paddingHorizontal: 14,
    justifyContent: "center",
    alignItems: "center",
  },
});