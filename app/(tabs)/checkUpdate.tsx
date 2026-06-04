// app/(tabs)/checkUpdate.tsx
import { View, Text } from "react-native";

export default function CheckUpdate() {
  return (
    <View
      style={{
        flex: 1,
        backgroundColor: "#050a14",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
      }}
    >
      <Text style={{ fontSize: 64 }}>🚧</Text>
      <Text
        style={{
          fontSize: 18,
          fontWeight: "800",
          color: "#94a3b8",
          letterSpacing: 2,
          textTransform: "uppercase",
        }}
      >
        Coming Soon
      </Text>
    </View>
  );
}