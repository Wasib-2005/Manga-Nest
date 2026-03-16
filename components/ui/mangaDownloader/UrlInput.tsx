import React from "react";
import { View, TextInput, TouchableOpacity, Text, ActivityIndicator } from "react-native";

interface Props {
  value:    string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  loading:  boolean;
}

export const UrlInput = ({ value, onChange, onSubmit, loading }: Props) => (
  <View className="flex-row gap-2 mb-6">
    <TextInput
      value={value}
      onChangeText={onChange}
      placeholder="nhentai.net/g/... or mangadex.org/chapter/..."
      placeholderTextColor="#aaa"
      autoCapitalize="none"
      autoCorrect={false}
      onSubmitEditing={onSubmit}
      returnKeyType="search"
      className="flex-1 bg-white border border-gray-200 rounded-xl px-4 py-3 text-sm text-black"
    />
    <TouchableOpacity
      onPress={onSubmit}
      disabled={loading}
      className="bg-[#38D926] rounded-xl px-4 justify-center items-center"
      style={{ minWidth: 80 }}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text className="text-white font-bold">Look up</Text>
      }
    </TouchableOpacity>
  </View>
);