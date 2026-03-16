import { Tabs } from "expo-router";
import React from "react";
import { MaterialIcons, FontAwesome } from "@expo/vector-icons";

import { HapticTab } from "@/components/haptic-tab";

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: "#38D926",
        tabBarInactiveTintColor: "#C7F4C2",
        headerShown: false,
        tabBarButton: HapticTab,
        tabBarStyle: {
          backgroundColor: "#1A6412",
          borderTopWidth: 0,
          height: 60,
        },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Reader",
          tabBarIcon: ({ color }) => (
            <MaterialIcons name="menu-book" size={28} color={color} />
          ),
        }}
      />

      <Tabs.Screen
        name="downloader"
        options={{
          title: "Downloader",
          tabBarIcon: ({ color }) => (
            <FontAwesome name="download" size={28} color={color} />
          ),
        }}
      />
    </Tabs>
  );
}