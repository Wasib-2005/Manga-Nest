import { Pressable, type PressableProps } from 'react-native';
import * as Haptics from 'expo-haptics';

type HapticTabProps = PressableProps & {
  onPressIn?: PressableProps["onPressIn"];
};

export function HapticTab(props: HapticTabProps) {
  return (
    <Pressable
      {...props}
      onPressIn={(ev) => {
        if (process.env.EXPO_OS === 'ios') {
          // Add a soft haptic feedback when pressing down on the tabs.
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
        props.onPressIn?.(ev);
      }}
    />
  );
}
