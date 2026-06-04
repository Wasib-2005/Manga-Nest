import {
  DarkTheme,
  DefaultTheme,
  ThemeProvider,
} from "expo-router/react-navigation";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import "react-native-reanimated";

import "../global.css";

import { useColorScheme } from "@/hooks/use-color-scheme";
import { CheckUpdateProvider } from "@/services/checkUpdates/checkUpdateContextProvider";
import { Text, View } from "react-native";
import { CheckUpdateContext } from "@/services/checkUpdates/checkUpdateContext";
import { useContext } from "react";

export const unstable_settings = {
  anchor: "(tabs)",
};

export default function RootLayout() {
  const colorScheme = useColorScheme();
  return (
    <ThemeProvider value={colorScheme === "dark" ? DarkTheme : DefaultTheme}>
      <CheckUpdateProvider>
        {/* <View><Text>Check Updates</Text></View> */}
        <Stack>
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          {/* <Stack.Screen name="modal" options={{ presentation: 'modal', title: 'Modal' }} /> */}
        </Stack>
        <StatusBar style="auto" />
      </CheckUpdateProvider>
    </ThemeProvider>
  );
}
