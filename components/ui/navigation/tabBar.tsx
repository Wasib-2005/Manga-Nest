import React, { useContext } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { MaterialCommunityIcons } from "@expo/vector-icons";
import { CheckUpdateContext } from "@/services/checkUpdates/checkUpdateContext";
import Animated, {
  useAnimatedStyle,
  useSharedValue,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useTabTransition } from "./tabTransitionContext";

type CustomTabBarProps = {
  state: {
    index: number;
    routes: Array<{ key: string; name: string }>;
  };
  descriptors: Record<string, { options: { tabBarLabel?: unknown; title?: string } }>;
  navigation: {
    emit: (event: { type: "tabPress"; target: string; canPreventDefault: true }) => {
      defaultPrevented?: boolean;
    };
    navigate: (name: string) => void;
  };
};

const AnimatedTabIcon = ({
  name,
  color,
  trigger,
}: {
  name: any;
  color: string;
  trigger: number;
}) => {
  const scale = useSharedValue(1);
  const rotate = useSharedValue(0);

  React.useEffect(() => {
    if (trigger === 0) return;
    scale.value = withSequence(
      withTiming(1.14, { duration: 80 }),
      withTiming(1, { duration: 140 }),
    );
    rotate.value = withSequence(
      withTiming(-5, { duration: 55 }),
      withTiming(5, { duration: 55 }),
      withTiming(0, { duration: 80 }),
    );
  }, [rotate, scale, trigger]);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ scale: scale.value }, { rotate: `${rotate.value}deg` }],
  }));

  return (
    <Animated.View style={animatedStyle}>
      <MaterialCommunityIcons name={name} size={22} color={color} />
    </Animated.View>
  );
};

export const CustomTabBar = ({
  state,
  descriptors,
  navigation,
}: CustomTabBarProps) => {
  // Destructure status (or isUpdateAvailable if you used the boolean naming variant)
  const { status, isUpdateAvailable } = useContext(CheckUpdateContext);
  const { setTransition, tabBarHidden, setTabBarHidden } = useTabTransition();
  
  // Checks if an update is ready based on either string state or explicit boolean flag
  const hasUpdate = status === "update_available" || isUpdateAvailable === true;
  const [iconTrigger, setIconTrigger] = React.useState(0);
  const [animatedRouteKey, setAnimatedRouteKey] = React.useState<string | null>(null);
  React.useEffect(() => {
    if (state.index !== 0) setTabBarHidden(false);
  }, [setTabBarHidden, state.index]);

  const tabBarStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: withTiming(tabBarHidden ? 88 : 0, { duration: 200 }) }],
    opacity: withTiming(tabBarHidden ? 0 : 1, { duration: 160 }),
  }), [tabBarHidden]);

  // console.log("TabBar Rendered - Update Available:", hasUpdate);

  return (
    <Animated.View
      style={[{
        flexDirection: "row",
        position: "absolute",
        left: 0,
        right: 0,
        bottom: 0,
        backgroundColor: "#030712",
        height: 88,
        paddingBottom: Platform.OS === "ios" ? 25 : 8,
        borderTopWidth: 1,
        borderTopColor: "#141c2b",
        elevation: 8,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: -4 },
        shadowOpacity: 0.2,
        shadowRadius: 4,
        overflow: "hidden",
      }, tabBarStyle]}
    >
      {state.routes.map((route, index) => {
        const { options } = descriptors[route.key];

        const rawLabel = options.tabBarLabel ?? options.title ?? route.name;
        const label = typeof rawLabel === "string" ? rawLabel : route.name;

        const isFocused = state.index === index;

        const onPress = () => {
          setAnimatedRouteKey(route.key);
          setIconTrigger((value) => value + 1);
          const event = navigation.emit({
            type: "tabPress",
            target: route.key,
            canPreventDefault: true,
          });

          if (!isFocused && !event.defaultPrevented) {
            setTransition(index > state.index ? 1 : -1, route.name);
            navigation.navigate(route.name);
          }
        };

        // Icon Mapping
        let iconName: any = "help-circle-outline";
        if (route.name === "index") iconName = "bookshelf";
        if (route.name === "downloader")
          iconName = isFocused ? "cloud-download" : "cloud-download-outline";
        if (route.name === "backup")
          iconName = isFocused ? "cloud-upload" : "cloud-upload-outline";
        if (route.name === "settings")
          iconName = isFocused ? "cog" : "cog-outline";
        if (route.name === "checkUpdate")
          iconName = "update";

        // Determine if this specific item should render the badge
        // Usually, badge alerts look best on either the 'settings' or 'checkUpdate' tabs
        const showBadgeOnThisTab = hasUpdate && (route.name === "settings" || route.name === "checkUpdate");

        return (
          <TouchableOpacity
            key={route.key}
            onPress={onPress}
            activeOpacity={0.7}
            style={{ flex: 1, justifyContent: "center", alignItems: "center" }}
          >
            <View style={{ position: "relative" }}>
              <View
                style={{
                  backgroundColor: isFocused ? "#38D92615" : "transparent",
                  paddingVertical: 4,
                  paddingHorizontal: 16,
                  borderRadius: 20,
                  marginBottom: 4,
                  borderWidth: 1,
                  borderColor: isFocused ? "#38D92630" : "transparent",
                }}
              >
                <AnimatedTabIcon
                  name={iconName}
                  color={isFocused ? "#38D926" : "#475569"}
                  trigger={animatedRouteKey === route.key ? iconTrigger : 0}
                />
              </View>

              {/* WARNING BADGE WITH exclamation mark ! */}
              {showBadgeOnThisTab && (
                <View
                  style={{
                    position: "absolute",
                    top: -4,
                    right: 4,
                    backgroundColor: "#EF4444", // Vibrant warning red color
                    width: 16,
                    height: 16,
                    borderRadius: 8,
                    justifyContent: "center",
                    alignItems: "center",
                    borderWidth: 1.5,
                    borderColor: "#030712", // Match your tab bar background
                    zIndex: 10,
                  }}
                >
                  <Text
                    style={{
                      color: "#FFFFFF",
                      fontSize: 10,
                      fontWeight: "900",
                      lineHeight: 12,
                      textAlign: "center",
                    }}
                  >
                    !
                  </Text>
                </View>
              )}
            </View>

            <Text
              numberOfLines={1}
              style={{
                color: isFocused ? "#38D926" : "#475569",
                fontSize: 10,
                fontWeight: isFocused ? "800" : "500",
                textTransform: "uppercase",
                letterSpacing: 0.5,
              }}
            >
              {label}
            </Text>
          </TouchableOpacity>
        );
      })}
    </Animated.View>
  );
};
