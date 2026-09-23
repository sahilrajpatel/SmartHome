// src/screens/DashboardScreen.js
// Front page: lists every ROOM in the house. Tapping a room opens
// RoomDetailScreen, which lists the board(s) installed in that room.
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, FlatList, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { ROOMS, nodesForRoom, applianceCountForRoom } from "../config";
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

export default function DashboardScreen({ navigation }) {
  const [brokerState, setBrokerState] = useState("connecting");
  const [nodeStatus, setNodeStatus] = useState({});

  useEffect(() => {
    const initial = {};
    ROOMS.forEach((room) => {
      nodesForRoom(room.id).forEach((n) => {
        initial[n.id] = parseStatus(getLastMessage(statusTopicFor(n.id)));
      });
    });
    setNodeStatus(initial);

    const offConn = onConnectionChange(setBrokerState);
    const offMsg = onMessage((topic, payload) => {
      ROOMS.forEach((room) => {
        nodesForRoom(room.id).forEach((n) => {
          if (topic === statusTopicFor(n.id)) {
            setNodeStatus((prev) => ({ ...prev, [n.id]: parseStatus(payload) }));
          }
        });
      });
    });
    return () => {
      offConn();
      offMsg();
    };
  }, []);

  const renderRoom = useCallback(
    ({ item }) => {
      const nodes = nodesForRoom(item.id);
      const onlineCount = nodes.filter((n) => nodeStatus[n.id] && nodeStatus[n.id].online).length;
      const allOnline = nodes.length > 0 && onlineCount === nodes.length;
      const anyOnline = onlineCount > 0;
      const applianceCount = applianceCountForRoom(item.id);
      return (
        <TouchableOpacity
          style={styles.card}
          activeOpacity={0.75}
          onPress={() => navigation.navigate("RoomDetail", { roomId: item.id })}
        >
          <View style={styles.roomIconWrap}>
            <Ionicons name={item.icon || "home-outline"} size={24} color={colors.accent} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.cardTitle}>{item.name}</Text>
            <Text style={styles.cardSub}>
              {nodes.length} board{nodes.length === 1 ? "" : "s"} · {applianceCount} switch{applianceCount === 1 ? "" : "es"}
            </Text>
          </View>
          <View style={[styles.dot, { backgroundColor: allOnline ? colors.success : anyOnline ? colors.warning : colors.danger }]} />
          <Ionicons name="chevron-forward" size={20} color={colors.textDim} style={{ marginLeft: 8 }} />
        </TouchableOpacity>
      );
    },
    [nodeStatus, navigation]
  );

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Home</Text>
        <View style={styles.brokerPill}>
          <View
            style={[
              styles.brokerDot,
              {
                backgroundColor:
                  brokerState === "connected" ? colors.success : brokerState === "connecting" ? colors.warning : colors.danger,
              },
            ]}
          />
          <Text style={styles.brokerText}>
            {brokerState === "connected" ? "Broker Connected" : brokerState === "connecting" ? "Connecting…" : "Disconnected"}
          </Text>
        </View>
      </View>

      <Text style={styles.sectionLabel}>ROOMS</Text>
      <FlatList
        data={ROOMS}
        keyExtractor={(item) => item.id}
        renderItem={renderRoom}
        contentContainerStyle={{ paddingHorizontal: 16, paddingBottom: 24 }}
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        ListEmptyComponent={
          <Text style={styles.empty}>No rooms configured yet. Add entries to ROOMS in src/config.js.</Text>
        }
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 12,
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerTitle: { fontSize: 26, fontWeight: "800", color: colors.text },
  brokerPill: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.border,
  },
  brokerDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  brokerText: { color: colors.textDim, fontSize: 11, fontWeight: "600" },
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
  roomIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.cardAlt,
    alignItems: "center",
    justifyContent: "center",
    marginRight: 14,
  },
  dot: { width: 10, height: 10, borderRadius: 5 },
  cardTitle: { color: colors.text, fontSize: 16, fontWeight: "700" },
  cardSub: { color: colors.textDim, fontSize: 12, marginTop: 3 },
  empty: { color: colors.textDim, textAlign: "center", marginTop: 40, paddingHorizontal: 20 },
});
