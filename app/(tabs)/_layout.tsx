import { Tabs } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Platform } from "react-native";
import { HapticTab } from "@/components/haptic-tab";
import { IconSymbol } from "@/components/ui/icon-symbol";
import { useColors } from "@/hooks/use-colors";

export default function TabLayout() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const bottomPadding = Platform.OS === "web" ? 12 : Math.max(insets.bottom, 8);
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colors.primary, tabBarInactiveTintColor: colors.muted, tabBarButton: HapticTab, tabBarStyle: { paddingTop: 8, paddingBottom: bottomPadding, height: 58 + bottomPadding, backgroundColor: colors.surface, borderTopColor: colors.border, borderTopWidth: 0.5 }, tabBarLabelStyle: { fontSize: 11, fontWeight: "600" } }}>
      <Tabs.Screen name="index" options={{ title: "Command", tabBarIcon: ({ color }) => <IconSymbol name="chart.bar.fill" size={22} color={color} /> }} />
      <Tabs.Screen name="queue" options={{ title: "Queue", tabBarIcon: ({ color }) => <IconSymbol name="tray.full.fill" size={22} color={color} /> }} />
      <Tabs.Screen name="compose" options={{ title: "Compose", tabBarIcon: ({ color }) => <IconSymbol name="square.and.pencil" size={22} color={color} /> }} />
      <Tabs.Screen name="outreach" options={{ title: "Outreach", tabBarIcon: ({ color }) => <IconSymbol name="bubble.left.and.bubble.right.fill" size={22} color={color} /> }} />
      <Tabs.Screen name="senders" options={{ title: "Senders", tabBarIcon: ({ color }) => <IconSymbol name="person.2.fill" size={22} color={color} /> }} />
    </Tabs>
  );
}
