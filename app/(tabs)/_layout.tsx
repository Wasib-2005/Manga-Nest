import { Tabs } from "expo-router";
import { CustomTabBar } from "../../components/ui/navigation/tabBar";
import { TabTransitionProvider } from "../../components/ui/navigation/tabTransitionContext";

export default function TabLayout() {
  
  return (
    <TabTransitionProvider>
      <Tabs
        tabBar={(props) => <CustomTabBar {...props} />}
        screenOptions={{ headerShown: false }}
      >
      <Tabs.Screen
        name="index"
        options={{
          title: "Library",
        }}
      />
      <Tabs.Screen
        name="downloader"
        options={{
          title: "Download",
        }}
      />
      <Tabs.Screen
        name="backup"
        options={{
          title: "Backup",
        }}
      />
      <Tabs.Screen
        name="checkUpdate"
        options={{
          title: "Updates",
        }}
      />
      </Tabs>
    </TabTransitionProvider>
  );
}
