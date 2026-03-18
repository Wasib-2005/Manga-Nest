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
      placeholder="Manga link or chapter URL..."
      placeholderTextColor="#475569"
      autoCapitalize="none"
      autoCorrect={false}
      onSubmitEditing={onSubmit}
      returnKeyType="search"
      editable={!loading}
      className="flex-1 bg-[#0a0e17] border border-[#1e293b] rounded-xl px-4 py-3 text-sm text-[#f1f5f9]"
    />
    
    {loading ? (
      <TouchableOpacity
        onPress={onCancel}
        activeOpacity={0.7}
        className="bg-red-500/10 border border-red-500 rounded-xl px-4 justify-center items-center"
        style={{ minWidth: 90 }}
      >
        <ActivityIndicator color="#ef4444" size="small" />
        <Text className="text-red-500 text-[10px] font-black uppercase mt-1">Cancel</Text>
      </TouchableOpacity>
    ) : (
      <TouchableOpacity
        onPress={onSubmit}
        activeOpacity={0.8}
        className="bg-[#38D926] rounded-xl px-4 justify-center items-center"
        style={{ minWidth: 90 }}
      >
        <Text className="text-[#030712] font-black uppercase text-xs">Look up</Text>
      </TouchableOpacity>
    )}
  </View>
);