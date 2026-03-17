import React from "react";
import { View, TextInput, TouchableOpacity, Text, ActivityIndicator } from "react-native";

interface Props {
  value:    string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
  loading:  boolean;
}

export const UrlInput = ({ value, onChange, onSubmit, onCancel, loading }: Props) => (
  <View className="flex-row gap-2 mb-6">
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="mangadex.org/chapter/...  or direct image URL"
      placeholderTextColor="#aaa"
      autoCapitalize="none"
      autoCorrect={false}
      onSubmitEditing={onSubmit}
      returnKeyType="search"
      editable={!loading}
      className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-black"
    />
    {loading ? (
      <TouchableOpacity
        onPress={onCancel}
        className="bg-red-400 rounded-xl px-4 justify-center items-center"
        style={{ minWidth: 80 }}
      >
        <ActivityIndicator color="#fff" size="small" style={{ marginBottom: 2 }} />
        <Text className="text-white text-xs font-bold">Cancel</Text>
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        onPress={onSubmit}
        className="bg-[#38D926] rounded-xl px-4 justify-center items-center"
        style={{ minWidth: 80 }}
      >
        <Text className="text-white font-bold">Look up</Text>
      </TouchableOpacity>
    )}
  </View>
);