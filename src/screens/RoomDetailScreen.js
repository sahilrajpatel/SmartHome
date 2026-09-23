// src/screens/RoomDetailScreen.js
// Opened by tapping a room on the Dashboard. Shows every board (ESP
// node) installed in that room. Tapping a board opens NodeDetailScreen
// with the full switch grid for that board.
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { ROOMS, nodesForRoom, appliancesForNode } from "../config";
import { onMessage, onConnectionChange, statusTopicFor, getLastMessage } from "../mqttClient";

function parseStatus(payload) {
  if (!payload) return null;
  try {
    const obj = JSON.parse(payload);
    return { online: obj.online !== false, ip: obj.ip, wifi: obj.wifi ?? obj.rssi };
  } catch (e) {
    return { online: payload === "online" || payload === "1", ip: null, wifi: null };
  }
}

export default function RoomDetailScreen({ route, navigation }) {
  const { roomId } = route.params;
  const room = ROOMS.find((r) => r.id === roomId);
  const nodes = nodesForRoom(roomId);
  const [nodeStatus, setNodeStatus] = useState({});
  const [brokerState, setBrokerState] = useState("connecting");

  useEffect(() => {
    const initial = {};
    nodes.forEach((n) => {
      initial[n.id] = parseStatus(getLastMessage(statusTopicFor(n.id)));
    });
    setNodeStatus(initial);

    const offConn = onConnectionChange(setBrokerState);
    const offMsg = onMessage((topic, payload) => {
      nodes.forEach((n) => {
        if (topic === statusTopicFor(n.id)) {
          setNodeStatus((prev) => ({ ...prev, [n.id]: parseStatus(payload) }));
        }
      });
    });
    return () => {
      offConn();
      offMsg();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roomId]);

  const renderNode = useCallback(
    ({ item }) => {
      const status = nodeStatus[item.id];
      const online = !!(status && status.online);
      const applianceCount = appliancesForNode(item.id).length;
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          onPress={() => navigation.navigate("NodeDetail", { nodeId: item.id })}
        >
          <View style={styles.iconWrap}>
            <Ionicons name="hardware-chip-outline" size={22} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardSub}>
              {applianceCount} switch{applianceCount === 1 ? "" : "es"}
              {status && status.ip ? ` · ${status.ip}` : ""}
            </Text>
          </View>
          <View style={[styles.dot, { backgroundColor: online ? colors.success : colors.danger }]} />
          <Text style={styles.dotLabel}>{online ? "Online" : "Offline"}</Text>
          <Ionicons name="chevron-forward" size={20} color={colors.textDim} style={{ marginLeft: 6 }} />
        </TouchableOpacity>
      );
    },
    [nodeStatus, navigation]
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>{room ? room.name : "Room"}</Text>
        <View style={styles.brokerPill}>
          <View
            style={[
              styles.brokerDot,
              { backgroundColor: brokerState === "connected" ? colors.success : brokerState === "connecting" ? colors.warning : colors.danger },
            ]}
          />
        </View>
      </View>

      <Text style={styles.sectionLabel}>BOARDS</Text>
      <FlatList
        data={nodes}
        keyExtractor={(item) => item.id}
        renderItem={renderNode}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={<Text style={styles.empty}>No boards assigned to this room yet.</Text>}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingTop: 8,
    paddingBottom: 12,
  },
  backBtn: { padding: 8 },
  headerTitle: { color: colors.text, fontSize: 20, fontWeight: "800" },
  brokerPill: {
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  brokerDot: { width: 8, height: 8, borderRadius: 4 },
  sectionLabel: { color: colors.textDim, fontSize: 12, fontWeight: "700", letterSpacing: 1, marginHorizontal: 16, marginBottom: 8 },
  card: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 14,
    padding: 16,
    borderWidth: 1,
    borderColor: colors.border,
  },
  iconWrap: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginLeft: 6 },
  dotLabel: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginLeft: 6 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardSub: { color: colors.textDim, fontSize: 12, marginTop: 3 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 40, paddingHorizontal: 20 },
});
