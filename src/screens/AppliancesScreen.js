// src/screens/AppliancesScreen.js
// Full list of every appliance in the house, grouped by which ESP node
// controls it. Tap the row to open a full, dedicated screen (not a
// popup) with Timer / Schedule / Sleep controls for that appliance.
import React, { useEffect, useState, useCallback, useMemo } from "react";
import { View, Text, StyleSheet, SectionList, Switch, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { SH_NODES, SH_APPLIANCES } from "../config";
import { onMessage, setPower, topicFor, getLastMessage } from "../mqttClient";

export default function AppliancesScreen({ navigation }) {
  const [states, setStates] = useState({});

  useEffect(() => {
    const initial = {};
    SH_APPLIANCES.forEach((a) => {
      const raw = getLastMessage(topicFor(a.node, a.channel, "state"));
      initial[a.id] = raw === "1" || raw === "ON" || raw === "on";
    });
    setStates(initial);

    const off = onMessage((topic, payload) => {
      SH_APPLIANCES.forEach((a) => {
        if (topic === topicFor(a.node, a.channel, "state")) {
          setStates((prev) => ({ ...prev, [a.id]: payload === "1" || payload === "ON" || payload === "on" }));
        }
      });
    });
    return off;
  }, []);

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

  const sections = useMemo(
    () =>
      SH_NODES.map((n) => ({
        title: n.name,
        data: SH_APPLIANCES.filter((a) => a.node === n.id),
      })).filter((s) => s.data.length > 0),
    []
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.headerTitle}>Appliances</Text>
      <SectionList
        sections={sections}
        keyExtractor={(item) => item.id}
        contentContainerStyle={{ padding: 16, paddingBottom: 24 }}
        renderSectionHeader={({ section }) => <Text style={styles.sectionLabel}>{section.title.toUpperCase()}</Text>}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        SectionSeparatorComponent={() => <View style={{ height: 16 }} />}
        renderItem={({ item }) => (
          <TouchableOpacity style={styles.row} activeOpacity={0.7} onPress={() => openDetail(item)}>
            <View style={styles.iconWrap}>
              <Ionicons name={item.icon || "flash-outline"} size={20} color={states[item.id] ? colors.neon : colors.textDim} />
            </View>
            <Text style={styles.rowLabel}>{item.name}</Text>
            <Ionicons name="chevron-forward" size={16} color={colors.textDim} style={{ marginRight: 10 }} />
            <Switch
              value={!!states[item.id]}
              onValueChange={() => toggle(item)}
              trackColor={{ false: colors.border, true: colors.neon }}
              thumbColor={states[item.id] ? colors.neon : "#cbd5e1"}
            />
          </TouchableOpacity>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerTitle: { fontSize: 26, fontWeight: "800", color: colors.text, marginHorizontal: 16, marginTop: 8, marginBottom: 4 },
  sectionLabel: { color: colors.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 14,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  rowLabel: { flex: 1, color: colors.text, fontSize: 15, fontWeight: "600" },
});
