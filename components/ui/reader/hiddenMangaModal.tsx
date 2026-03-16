import React, { useState, useEffect } from "react";
import {
  View,
  Text,
  Modal,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
} from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import {
  isHidePasswordSet,
  setHidePassword,
  verifyHidePassword,
  getHiddenMangaList,
  addToHiddenList,
  removeFromHiddenList,
} from "../../../services/reader/readingProgressService";
import {
  readMangaLibrary,
  type MangaEntry,
} from "../../../services/reader/libraryService";

interface Props {
  visible: boolean;
  onClose: () => void;
}

type Stage = "verify" | "manage" | "setup";

export const HiddenMangaModal = ({ visible, onClose }: Props) => {
  const [stage, setStage] = useState<Stage>("verify");
  const [password, setPassword] = useState("");
  const [passwordSet, setPasswordSet] = useState(false);
  const [hiddenList, setHiddenList] = useState<string[]>([]);
  const [allManga, setAllManga] = useState<MangaEntry[]>([]);
  const [loading, setLoading] = useState(true);

  // Load initial data
  useEffect(() => {
    if (!visible) return;

    const load = async () => {
      setLoading(true);
      const hasPassword = await isHidePasswordSet();
      setPasswordSet(hasPassword);
      setStage(hasPassword ? "verify" : "setup");

      const hidden = await getHiddenMangaList();
      setHiddenList(hidden);

      const library = await readMangaLibrary();
      setAllManga(library);

      setPassword("");
      setLoading(false);
    };

    load();
  }, [visible]);

  // Handle password verification
  const handleVerify = async () => {
    if (!password.trim()) {
      Alert.alert("Error", "Please enter your password");
      return;
    }

    const verified = await verifyHidePassword(password);
    if (verified) {
      setStage("manage");
    } else {
      Alert.alert("Error", "Incorrect password");
    }
  };

  // Handle password setup
  const handleSetPassword = async () => {
    if (!password.trim() || password.length < 4) {
      Alert.alert("Error", "Password must be at least 4 characters");
      return;
    }

    try {
      await setHidePassword(password);
      setPasswordSet(true);
      setStage("manage");
      Alert.alert("Success", "Password set successfully");
    } catch (err) {
      Alert.alert("Error", "Failed to set password");
    }
  };

  // Toggle hide status
  const handleToggleHide = async (uid: string) => {
    if (hiddenList.includes(uid)) {
      await removeFromHiddenList(uid);
      setHiddenList(hiddenList.filter((id) => id !== uid));
    } else {
      await addToHiddenList(uid);
      setHiddenList([...hiddenList, uid]);
    }
  };

  if (loading) {
    return (
      <Modal visible={visible} transparent animationType="fade">
        <View className="flex-1 bg-black/50 justify-center items-center">
          <Text className="text-white">Loading...</Text>
        </View>
      </Modal>
    );
  }

  return (
    <Modal visible={visible} transparent animationType="slide">
      <View className="flex-1 bg-white">
        {/* Header */}
        <View className="flex-row justify-between items-center px-4 py-4 border-b border-gray-200">
          <Text className="text-xl font-bold text-gray-900">Hidden Manga</Text>
          <TouchableOpacity onPress={onClose}>
            <MaterialCommunityIcons name="close" size={24} color="#666" />
          </TouchableOpacity>
        </View>

        <ScrollView
          className="flex-1 px-4 py-4"
          contentContainerStyle={{ paddingBottom: 24 }}
        >
          {stage === "verify" && (
            // Password verification
            <View>
              <Text className="text-center text-gray-600 mb-6">
                Enter your password to manage hidden manga
              </Text>

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Enter password"
                placeholderTextColor="#aaa"
                secureTextEntry
                className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4 text-black"
              />

              <TouchableOpacity
                onPress={handleVerify}
                className="bg-[#38D926] rounded-lg py-3 items-center"
              >
                <Text className="text-white font-bold">Verify Password</Text>
              </TouchableOpacity>
            </View>
          )}

          {stage === "setup" && (
            // Password setup
            <View>
              <Text className="text-center text-gray-600 mb-6">
                Set a password to protect hidden manga
              </Text>

              <TextInput
                value={password}
                onChangeText={setPassword}
                placeholder="Create password (min 4 chars)"
                placeholderTextColor="#aaa"
                secureTextEntry
                className="bg-gray-50 border border-gray-200 rounded-lg px-4 py-3 mb-4 text-black"
              />

              <TouchableOpacity
                onPress={handleSetPassword}
                className="bg-[#38D926] rounded-lg py-3 items-center"
              >
                <Text className="text-white font-bold">Set Password</Text>
              </TouchableOpacity>
            </View>
          )}

          {stage === "manage" && (
            // Manage hidden manga
            <View>
              <View className="flex-row justify-between items-center mb-4">
                <Text className="text-lg font-bold text-gray-900">
                  Hidden: {hiddenList.length}
                </Text>
                <TouchableOpacity
                  onPress={() => {
                    setPassword("");
                    setStage("verify");
                  }}
                  className="text-[#38D926]"
                >
                  <Text className="text-xs font-bold">Change Password</Text>
                </TouchableOpacity>
              </View>

              {allManga.length === 0 ? (
                <Text className="text-center text-gray-500">
                  No manga to hide
                </Text>
              ) : (
                <View>
                  {allManga.map((manga) => {
                    const isHidden = hiddenList.includes(manga.uid);
                    return (
                      <TouchableOpacity
                        key={manga.uid}
                        onPress={() => handleToggleHide(manga.uid)}
                        className={`flex-row items-center p-3 rounded-lg mb-2 ${
                          isHidden
                            ? "bg-red-50 border border-red-200"
                            : "bg-gray-50 border border-gray-200"
                        }`}
                      >
                        <View className="flex-1">
                          <Text
                            className="font-semibold text-gray-900"
                            numberOfLines={1}
                          >
                            {manga.name}
                          </Text>
                          <Text className="text-xs text-gray-500 mt-1">
                            {manga.author}
                          </Text>
                        </View>

                        <View
                          className={`px-3 py-1 rounded-full ${
                            isHidden
                              ? "bg-red-200"
                              : "bg-white border border-gray-300"
                          }`}
                        >
                          <Text
                            className={`text-xs font-bold ${
                              isHidden ? "text-red-600" : "text-gray-600"
                            }`}
                          >
                            {isHidden ? "HIDDEN" : "SHOW"}
                          </Text>
                        </View>
                      </TouchableOpacity>
                    );
                  })}
                </View>
              )}
            </View>
          )}
        </ScrollView>
      </View>
    </Modal>
  );
};
