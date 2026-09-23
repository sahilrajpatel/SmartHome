import { Buffer } from 'buffer';
global.Buffer = Buffer;
import "react-native-url-polyfill/auto";
import React, { useEffect, useState } from "react";
import { StatusBar } from "expo-status-bar";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { Ionicons } from "@expo/vector-icons";

import SplashScreen from "./src/screens/SplashScreen";
import DashboardScreen from "./src/screens/DashboardScreen";
import RoomDetailScreen from "./src/screens/RoomDetailScreen";
import NodeDetailScreen from "./src/screens/NodeDetailScreen";
import ApplianceDetailScreen from "./src/screens/ApplianceDetailScreen";
import ApplianceTimerScreen from "./src/screens/ApplianceTimerScreen";
import ApplianceScheduleScreen from "./src/screens/ApplianceScheduleScreen";
import SleepConfigScreen from "./src/screens/SleepConfigScreen";
import AppliancesScreen from "./src/screens/AppliancesScreen";
import RemoteScreen from "./src/screens/RemoteScreen";
import SettingsScreen from "./src/screens/SettingsScreen";
import WifiSettingsScreen from "./src/screens/WifiSettingsScreen";
import { colors } from "./src/theme";
import { initFromStorage } from "./src/mqttClient";

const Tab = createBottomTabNavigator();
const DashboardStack = createNativeStackNavigator();
const AppliancesStack = createNativeStackNavigator();

const ICONS = {
  Dashboard: "home",
  Appliances: "list",
  Remote: "tv",
  Settings: "settings",
};

// DefaultTheme se merge karna zaroori hai - naye @react-navigation
// versions me theme.fonts bhi expect hota hai (bottom-tabs isse
// padhta hai), sirf apna colors object dena crash de raha tha
// ("Cannot read properties of undefined (reading 'medium')").
const navTheme = {
  ...DefaultTheme,
  dark: true,
  colors: {
    ...DefaultTheme.colors,
    primary: colors.accent,
    background: colors.bg,
    card: colors.card,
    text: colors.text,
    border: colors.border,
    notification: colors.accent,
  },
};

// Dashboard tab is itself a stack: rooms -> the boards in that room ->
// a board's switches -> a single appliance's full detail screen (timer /
// schedule / sleep) — a real screen, not a popup.
function DashboardStackScreen() {
  return (
    <DashboardStack.Navigator screenOptions={{ headerShown: false }}>
      <DashboardStack.Screen name="DashboardHome" component={DashboardScreen} />
      <DashboardStack.Screen name="RoomDetail" component={RoomDetailScreen} />
      <DashboardStack.Screen name="NodeDetail" component={NodeDetailScreen} />
      <DashboardStack.Screen name="WifiSettings" component={WifiSettingsScreen} options={{ presentation: "card" }} />
      <DashboardStack.Screen name="ApplianceDetail" component={ApplianceDetailScreen} options={{ presentation: "card" }} />
      <DashboardStack.Screen name="ApplianceTimer" component={ApplianceTimerScreen} options={{ presentation: "card" }} />
      <DashboardStack.Screen name="ApplianceSchedule" component={ApplianceScheduleScreen} options={{ presentation: "card" }} />
      <DashboardStack.Screen name="SleepConfig" component={SleepConfigScreen} options={{ presentation: "card" }} />
    </DashboardStack.Navigator>
  );
}

// Appliances tab is its own stack too, so tapping any appliance there
// also opens the same full-screen detail page.
function AppliancesStackScreen() {
  return (
    <AppliancesStack.Navigator screenOptions={{ headerShown: false }}>
      <AppliancesStack.Screen name="AppliancesHome" component={AppliancesScreen} />
      <AppliancesStack.Screen name="ApplianceDetail" component={ApplianceDetailScreen} options={{ presentation: "card" }} />
      <AppliancesStack.Screen name="ApplianceTimer" component={ApplianceTimerScreen} options={{ presentation: "card" }} />
      <AppliancesStack.Screen name="ApplianceSchedule" component={ApplianceScheduleScreen} options={{ presentation: "card" }} />
    </AppliancesStack.Navigator>
  );
}

export default function App() {
  const [showSplash, setShowSplash] = useState(true);

  useEffect(() => {
    initFromStorage(); // connects to saved (or default) broker once, app-wide
  }, []);

  if (showSplash) {
    // Splash opens right away once any board is confirmed online, and
    // otherwise auto-opens on its own within a random <3s window.
    return <SplashScreen onFinish={() => setShowSplash(false)} />;
  }

  return (
    <NavigationContainer theme={navTheme}>
      <StatusBar style="light" />
      <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarActiveTintColor: colors.accent,
          tabBarInactiveTintColor: colors.textDim,
          tabBarStyle: { backgroundColor: colors.card, borderTopColor: colors.border },
          tabBarIcon: ({ color, size }) => (
            <Ionicons name={ICONS[route.name]} size={size} color={color} />
          ),
        })}
      >
        <Tab.Screen name="Dashboard" component={DashboardStackScreen} />
        <Tab.Screen name="Appliances" component={AppliancesStackScreen} />
        <Tab.Screen name="Remote" component={RemoteScreen} />
        <Tab.Screen name="Settings" component={SettingsScreen} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
