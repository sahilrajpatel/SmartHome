// src/screens/NodeDetailScreen.js
// Opened by tapping a board inside a room. Shows every appliance wired
// to that board as a grid of switch tiles (icon + name + state), the
// same layout as a market smart-home app. Tapping a tile opens the
// full ApplianceDetailScreen (power toggle + timer/schedule/sleep).
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity, Switch } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { SH_NODES, appliancesForNode } from "../config";
import {
  onMessage,
  onConnectionChange,
  setPower,
  topicFor,
  statusTopicFor,
  getLastMessage,
  sleepTopicFor,
  setSleepMode,
} from "../mqttClient";

const NUM_COLUMNS = 3;

function parseStatus(payload) {
  if (!payload) return null;
  try {
    const obj = JSON.parse(payload);
    return { online: obj.online !== false };
  } catch (e) {
    return { online: payload === "online" || payload === "1" };
  }
}

export default function NodeDetailScreen({ route, navigation }) {
  const { nodeId } = route.params;
  const node = SH_NODES.find((n) => n.id === nodeId);
  const appliances = appliancesForNode(nodeId);
  const sleepAppliance = appliances.find((a) => a.sleep); // e.g. tvboard's AC
  const [states, setStates] = useState({});
  const [online, setOnline] = useState(false);
  const [sleepOn, setSleepOn] = useState(false);

  useEffect(() => {
    const initial = {};
    appliances.forEach((a) => {
      const raw = getLastMessage(topicFor(a.node, a.channel, "state"));
      initial[a.id] = raw === "1" || raw === "ON" || raw === "on";
    });
    setStates(initial);

    const st = parseStatus(getLastMessage(statusTopicFor(nodeId)));
    setOnline(!!(st && st.online));

    if (sleepAppliance) {
      const rawSleep = getLastMessage(sleepTopicFor(sleepAppliance.node, sleepAppliance.channel, "state"));
      setSleepOn(rawSleep === "1" || rawSleep === "ON" || rawSleep === "on");
    }

    const off = onMessage((topic, payload) => {
      appliances.forEach((a) => {
        if (topic === topicFor(a.node, a.channel, "state")) {
          setStates((prev) => ({ ...prev, [a.id]: payload === "1" || payload === "ON" || payload === "on" }));
        }
      });
      if (topic === statusTopicFor(nodeId)) {
        const s = parseStatus(payload);
        setOnline(!!(s && s.online));
      }
      if (sleepAppliance && topic === sleepTopicFor(sleepAppliance.node, sleepAppliance.channel, "state")) {
        setSleepOn(payload === "1" || payload === "ON" || payload === "on");
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const toggleSleep = useCallback(() => {
    if (!sleepAppliance) return;
    setSleepOn((prev) => {
      const next = !prev;
      setSleepMode(sleepAppliance.node, sleepAppliance.channel, next);
      return next;
    });
  }, [sleepAppliance]);

  const onCount = appliances.filter((a) => states[a.id]).length;

  const toggle = useCallback((appliance) => {
    setStates((prev) => {
      const next = !prev[appliance.id];
      setPower(appliance.node, appliance.channel, next);
      return { ...prev, [appliance.id]: next };
    });
  }, []);

  const openDetail = useCallback(
    (appliance) => navigation.navigate("ApplianceDetail", { applianceId: appliance.id }),
    [navigation]
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{node ? node.name : nodeId}</Text>
        <View style={styles.headerRight}>
          <TouchableOpacity onPress={() => navigation.navigate("WifiSettings", { nodeId })} style={styles.wifiBtn}>
            <Ionicons name="wifi-outline" size={20} color={colors.text} />
          </TouchableOpacity>
          <View style={[styles.statusDot, { backgroundColor: online ? colors.success : colors.danger }]} />
        </View>
      </View>

      <View style={styles.statsRow}>
        <View style={styles.statCard}>
          <Ionicons name="flash-outline" size={18} color={colors.neon} />
          <Text style={styles.statValue}>{onCount}</Text>
          <Text style={styles.statLabel}>Switches ON</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name="apps-outline" size={18} color={colors.accent} />
          <Text style={styles.statValue}>{appliances.length}</Text>
          <Text style={styles.statLabel}>Total</Text>
        </View>
        <View style={styles.statCard}>
          <Ionicons name={online ? "wifi-outline" : "cloud-offline-outline"} size={18} color={online ? colors.success : colors.danger} />
          <Text style={styles.statValue}>{online ? "Online" : "Offline"}</Text>
          <Text style={styles.statLabel}>Board</Text>
        </View>
      </View>

      <View style={styles.sleepCard}>
        {sleepAppliance ? (
          <>
            <View style={styles.sleepIconWrap}>
              <Ionicons name="moon-outline" size={20} color={sleepOn ? colors.neon : colors.textDim} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sleepTitle}>Sleep Mode ({sleepAppliance.name})</Text>
              <Text style={styles.sleepSubtitle}>Cycles while on · tap gear for full Night Mode</Text>
            </View>
            <Switch
              value={sleepOn}
              onValueChange={toggleSleep}
              trackColor={{ false: colors.border, true: colors.neonDim }}
              thumbColor={sleepOn ? colors.neon : colors.textDim}
            />
            <TouchableOpacity
              style={styles.sleepGearBtn}
              onPress={() => navigation.navigate("SleepConfig", { nodeId })}
            >
              <Ionicons name="settings-outline" size={18} color={colors.text} />
            </TouchableOpacity>
          </>
        ) : (
          <TouchableOpacity
            style={{ flexDirection: "row", alignItems: "center", flex: 1 }}
            activeOpacity={0.75}
            onPress={() => navigation.navigate("SleepConfig", { nodeId })}
          >
            <View style={styles.sleepIconWrap}>
              <Ionicons name="moon-outline" size={20} color={colors.textDim} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={styles.sleepTitle}>Night Mode</Text>
              <Text style={styles.sleepSubtitle}>Pick switches to turn off at night</Text>
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.textDim} />
          </TouchableOpacity>
        )}
      </View>

      <FlatList
        data={appliances}
        keyExtractor={(item) => item.id}
        numColumns={NUM_COLUMNS}
        contentContainerStyle={{ padding: 16, paddingTop: 4 }}
        columnWrapperStyle={{ justifyContent: "space-between" }}
        ItemSeparatorComponent={() => <View style={{ height: 12 }} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No switches configured for this board yet. Add entries to SH_APPLIANCES in src/config.js.</Text>
        }
        renderItem={({ item }) => {
          const isOn = !!states[item.id];
          return (
            <TouchableOpacity
              style={[styles.tile, isOn && styles.tileOn]}
              activeOpacity={0.75}
              onPress={() => openDetail(item)}
              onLongPress={() => toggle(item)}
            >
              <View style={[styles.tileIconWrap, isOn && styles.tileIconWrapOn]}>
                <Ionicons name={item.icon || "flash-outline"} size={22} color={isOn ? colors.bg : colors.textDim} />
              </View>
              <Text style={[styles.tileLabel, isOn && styles.tileLabelOn]} numberOfLines={1}>
                {item.name}
              </Text>
              <Text style={[styles.tileState, isOn && styles.tileStateOn]}>{isOn ? "ON" : "OFF"}</Text>
            </TouchableOpacity>
          );
        }}
      />
      <Text style={styles.hint}>Tap a switch to open its controls · long-press to toggle instantly</Text>
    </SafeAreaView>
  );
}

const TILE_SIZE_PCT = "31%";

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 4,
  },
  backBtn: { padding: 8 },
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },
  headerRight: { flexDirection: "row", alignItems: "center" },
  wifiBtn: { padding: 6, marginRight: 6 },
  statusDot: { width: 10, height: 10, borderRadius: 5, marginRight: 10 },

  statsRow: { flexDirection: "row", paddingHorizontal: 16, marginTop: 6, marginBottom: 4 },
  statCard: {
    flex: 1,
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 12,
    alignItems: "center",
    marginRight: 8,
  },
  statValue: { color: colors.text, fontSize: 16, fontWeight: "800", marginTop: 6 },
  statLabel: { color: colors.textDim, fontSize: 10, fontWeight: "600", marginTop: 2 },

  sleepCard: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    marginHorizontal: 16,
    marginTop: 10,
    paddingVertical: 12,
    paddingHorizontal: 14,
  },
  sleepIconWrap: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  sleepTitle: { color: colors.text, fontSize: 14, fontWeight: "700" },
  sleepSubtitle: { color: colors.textDim, fontSize: 11, marginTop: 2 },
  sleepGearBtn: { padding: 6, marginLeft: 8 },

  tile: {
    width: TILE_SIZE_PCT,
    aspectRatio: 1,
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
    padding: 8,
  },
  tileOn: {
    backgroundColor: colors.neon,
    borderColor: colors.neon,
  },
  tileIconWrap: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 8,
  },
  tileIconWrapOn: {
    backgroundColor: "rgba(0,0,0,0.18)",
  },
  tileLabel: { color: colors.text, fontSize: 12, fontWeight: "700", textAlign: "center" },
  tileLabelOn: { color: colors.bg },
  tileState: { color: colors.textDim, fontSize: 10, fontWeight: "600", marginTop: 3 },
  tileStateOn: { color: "rgba(0,0,0,0.65)" },

  hint: { color: colors.textDim, fontSize: 11, textAlign: "center", marginBottom: 12 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 40, paddingHorizontal: 20 },
});
