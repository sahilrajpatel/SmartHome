// src/screens/WifiSettingsScreen.js
// Opened from the WiFi icon on a board's NodeDetailScreen. Lets you:
//   - see which WiFi networks the board currently knows about, and
//     which one it's connected to right now (from the board itself)
//   - add / edit / remove saved networks (SSID + password)
//   - send the updated list to the board over MQTT — the board saves
//     it to flash and auto-connects to whichever of these is in range,
//     switching networks on its own if you move the board or if the
//     current one goes down.
//
// The board never echoes passwords back (for security), so this screen
// keeps its own local copy (AsyncStorage, per-node) as the source of
// truth for what you've typed — that way editing one network later, or
// adding a new one, doesn't force you to retype passwords you already
// saved.
import React, { useEffect, useState, useCallback } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { colors } from "../theme";
import { SH_NODES } from "../config";
import { onMessage, getLastMessage, wifiListTopicFor, setWifiList } from "../mqttClient";

function storageKey(nodeId) {
  return `sh_wifi_networks_${nodeId}_v1`;
}

function emptyNetwork() {
  return { key: String(Date.now() + Math.random()), ssid: "", password: "" };
}

export default function WifiSettingsScreen({ route, navigation }) {
  const { nodeId } = route.params;
  const node = SH_NODES.find((n) => n.id === nodeId);

  const [networks, setNetworks] = useState([]);
  const [boardNetworks, setBoardNetworks] = useState([]); // SSIDs the board currently knows (no passwords)
  const [connectedSsid, setConnectedSsid] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let cancelled = false;
    AsyncStorage.getItem(storageKey(nodeId)).then((raw) => {
      if (cancelled) return;
      if (raw) {
        try {
          const parsed = JSON.parse(raw);
          if (Array.isArray(parsed) && parsed.length) {
            setNetworks(parsed.map((n) => ({ key: String(Math.random()), ssid: n.ssid || "", password: n.password || "" })));
            return;
          }
        } catch (e) {
          // fall through to default below
        }
      }
      setNetworks([emptyNetwork()]);
    });
    return () => {
      cancelled = true;
    };
  }, [nodeId]);

  useEffect(() => {
    const stateTopic = wifiListTopicFor(nodeId, "state");
    const applyState = (raw) => {
      if (!raw) return;
      try {
        const obj = JSON.parse(raw);
        setBoardNetworks(Array.isArray(obj.networks) ? obj.networks : []);
        setConnectedSsid(obj.connected || "");
      } catch (e) {
        // ignore malformed retained payload
      }
    };
    applyState(getLastMessage(stateTopic));
    const off = onMessage((topic, payload) => {
      if (topic === stateTopic) applyState(payload);
    });
    return off;
  }, [nodeId]);

  const updateNetwork = (key, field) => (val) =>
    setNetworks((prev) => prev.map((n) => (n.key === key ? { ...n, [field]: val } : n)));

  const addNetwork = useCallback(() => setNetworks((prev) => [...prev, emptyNetwork()]), []);

  const removeNetwork = useCallback(
    (key) => setNetworks((prev) => (prev.length > 1 ? prev.filter((n) => n.key !== key) : prev)),
    []
  );

  const onSave = useCallback(async () => {
    const cleaned = networks.map((n) => ({ ssid: n.ssid.trim(), password: n.password })).filter((n) => n.ssid.length > 0);
    if (cleaned.length === 0) {
      Alert.alert("Add at least one network", "Enter at least one WiFi name (SSID) before saving.");
      return;
    }
    setSaving(true);
    try {
      await AsyncStorage.setItem(storageKey(nodeId), JSON.stringify(cleaned));
      setWifiList(nodeId, cleaned);
      Alert.alert("Sent to board", "Board will save this list and reconnect using whichever network is available.");
    } catch (e) {
      Alert.alert("Error", "Could not save WiFi settings.");
    } finally {
      setSaving(false);
    }
  }, [networks, nodeId]);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>WiFi · {node ? node.name : nodeId}</Text>
          <View style={{ width: 24 }} />
        </View>

        {!!connectedSsid && (
          <View style={styles.connectedRow}>
            <Ionicons name="wifi" size={14} color={colors.success} />
            <Text style={styles.connectedText}>Board currently connected to "{connectedSsid}"</Text>
          </View>
        )}
        {!connectedSsid && boardNetworks.length > 0 && (
          <View style={styles.connectedRow}>
            <Ionicons name="cloud-offline-outline" size={14} color={colors.danger} />
            <Text style={styles.connectedText}>Board not connected to any saved network right now</Text>
          </View>
        )}

        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.hint}>
            Add every WiFi network the board might need (home router, a second router, a phone hotspot). The board tries all of
            them and auto-connects to whichever is in range — and switches over on its own if that one drops.
          </Text>

          {networks.map((n, idx) => (
            <View key={n.key} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardTitle}>Network {idx + 1}</Text>
                {networks.length > 1 && (
                  <TouchableOpacity onPress={() => removeNetwork(n.key)}>
                    <Ionicons name="trash-outline" size={18} color={colors.danger} />
                  </TouchableOpacity>
                )}
              </View>

              <Text style={styles.label}>WIFI NAME (SSID)</Text>
              <TextInput
                style={styles.input}
                value={n.ssid}
                onChangeText={updateNetwork(n.key, "ssid")}
                placeholder="e.g. Patel Home"
                placeholderTextColor={colors.textDim}
                autoCapitalize="none"
                autoCorrect={false}
              />

              <Text style={styles.label}>PASSWORD</Text>
              <TextInput
                style={styles.input}
                value={n.password}
                onChangeText={updateNetwork(n.key, "password")}
                placeholder="leave blank for open network"
                placeholderTextColor={colors.textDim}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>
          ))}

          <TouchableOpacity style={styles.addBtn} onPress={addNetwork}>
            <Ionicons name="add-circle-outline" size={18} color={colors.accent} />
            <Text style={styles.addBtnText}>Add another network</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
            <Ionicons name="cloud-upload-outline" size={18} color={colors.bg} />
            <Text style={styles.saveBtnText}>{saving ? "Sending…" : "Save & send to board"}</Text>
          </TouchableOpacity>

          <Text style={styles.footnote}>
            Saved on the board's flash memory — survives power cuts and reboots. Update the password here anytime it changes.
          </Text>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
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
    paddingBottom: 4,
  },
  backBtn: { padding: 8 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },

  connectedRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 6 },
  connectedText: { color: colors.textDim, fontSize: 12, marginLeft: 6, flexShrink: 1 },

  hint: { color: colors.textDim, fontSize: 12, lineHeight: 17, marginBottom: 16 },

  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    marginBottom: 14,
  },
  cardHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 4 },
  cardTitle: { color: colors.text, fontSize: 13, fontWeight: "700" },

  label: { color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 6, marginTop: 12 },
  input: {
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.text,
    fontSize: 14,
  },

  addBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 12 },
  addBtnText: { color: colors.accent, fontWeight: "700", fontSize: 13, marginLeft: 6 },

  saveBtn: {
    flexDirection: "row",
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 12,
  },
  saveBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15, marginLeft: 8 },

  footnote: { color: colors.textDim, fontSize: 11, textAlign: "center", marginTop: 16, lineHeight: 16 },
});
