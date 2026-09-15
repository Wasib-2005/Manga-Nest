import React, { createContext, useContext, useMemo, useState } from "react";
import { Dimensions } from "react-native";
import {
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from "react-native-reanimated";

const DEFAULT_TAB_CHANGE_ANIMATION_DURATION = 180;
const configuredDuration = Number(
  process.env.EXPO_PUBLIC_TAB_CHANGE_ANIMATION_DURATION,
);
const TAB_CHANGE_ANIMATION_DURATION =
  Number.isFinite(configuredDuration) && configuredDuration >= 0
    ? configuredDuration
    : DEFAULT_TAB_CHANGE_ANIMATION_DURATION;

console.log("TAB_CHANGE_ANIMATION_DURATION", TAB_CHANGE_ANIMATION_DURATION);

type TabTransitionContextValue = {
  direction: -1 | 0 | 1;
  transitionKey: number;
  targetRoute: string | null;
  tabBarHidden: boolean;
  setTransition: (direction: -1 | 1, targetRoute: string) => void;
  setTabBarHidden: (hidden: boolean) => void;
  consumeTransition: (routeName: string, transitionKey: number) => boolean;
};

const TabTransitionContext = createContext<TabTransitionContextValue>({
  direction: 0,
  transitionKey: 0,
  targetRoute: null,
  tabBarHidden: false,
  setTransition: () => {},
  setTabBarHidden: () => {},
  consumeTransition: () => false,
});

export function TabTransitionProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [transition, setTransitionState] = useState<{
    direction: -1 | 0 | 1;
    key: number;
    targetRoute: string | null;
  }>({
    direction: 0,
    key: 0,
    targetRoute: null,
  });
  const consumedTransitions = React.useRef(new Set<string>());
  const [tabBarHidden, setTabBarHidden] = useState(false);

  const value = useMemo(
    () => ({
      direction: transition.direction,
      transitionKey: transition.key,
      targetRoute: transition.targetRoute,
      tabBarHidden,
      setTransition: (direction: -1 | 1, targetRoute: string) =>
        setTransitionState((previous) => ({
          direction,
          targetRoute,
          key: previous.key + 1,
        })),
      setTabBarHidden,
      consumeTransition: (routeName: string, transitionKey: number) => {
        const id = `${transitionKey}:${routeName}`;
        if (consumedTransitions.current.has(id)) return false;
        consumedTransitions.current.add(id);
        return true;
      },
    }),
    [tabBarHidden, transition],
  );

  return (
    <TabTransitionContext.Provider value={value}>
      {children}
    </TabTransitionContext.Provider>
  );
}

export function useTabTransition() {
  return useContext(TabTransitionContext);
}

export function useTabScreenAnimation(routeName: string) {
  const { direction, targetRoute, transitionKey, consumeTransition } =
    useTabTransition();
  const translateX = useSharedValue(0);

  React.useEffect(() => {
    if (
      transitionKey === 0 ||
      targetRoute !== routeName ||
      !consumeTransition(routeName, transitionKey)
    ) {
      return;
    }
    translateX.value = direction * Dimensions.get("window").width;
    translateX.value = withTiming(0, {
      duration: TAB_CHANGE_ANIMATION_DURATION,
    });
  }, [direction, routeName, targetRoute, transitionKey, translateX]);

  return useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));
}
