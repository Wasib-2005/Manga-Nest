import React from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { BottomTabBarProps } from "@react-navigation/bottom-tabs";

export const CustomTabBar = ({ state, descriptors, navigation }: BottomTabBarProps) => {
  return (
    <View style={{
      flexDirection: "row",
      backgroundColor: "#030712",
      height: Platform.OS === "ios" ? 88 : 65,
      paddingBottom: Platform.OS === "ios" ? 25 : 8,
      borderTopWidth: 1,
      borderTopColor: "#141c2b",
      elevation: 8,
      shadowColor: "#000",
      shadowOffset: { width: 0, height: -4 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
    }}>
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];
        
        // FIX: Safely handle the label. If it's a function, we use the route name or title.
        const rawLabel = options.tabBarLabel ?? options.title ?? route.name;
        const label = typeof rawLabel === 'function' ? route.name : rawLabel;

        const isFocused = state.index === index;

        const onPress = () => {
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            navigation.navigate(route.name);
          }
        };

        // Icon Mapping
        let iconName: any = "help-circle-outline";
        if (route.name === "index") iconName = "bookshelf";
        if (route.name === "downloader") iconName = isFocused ? "cloud-download" : "cloud-download-outline";
        if (route.name === "settings") iconName = isFocused ? "cog" : "cog-outline";

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            activeOpacity={0.7}
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <View style={{
              backgroundColor: isFocused ? "#38D92615" : "transparent",
              paddingVertical: 4,
              paddingHorizontal: 16,
              borderRadius: 20,
              marginBottom: 4,
              borderWidth: 1,
              borderColor: isFocused ? "#38D92630" : "transparent"
            }}>
              <MaterialCommunityIcons
                name={iconName}
                size={22}
                color={isFocused ? "#38D926" : "#475569"}
              />
            </View>
            <Text 
              numberOfLines={1}
              style={{
                color: isFocused ? "#38D926" : "#475569",
                fontSize: 10,
                fontWeight: isFocused ? "800" : "500",
                textTransform: "uppercase",
                letterSpacing: 0.5
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
};