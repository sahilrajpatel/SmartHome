// src/screens/SettingsScreen.js
// Lets the user point the app at their own broker (HiveMQ Cloud, EMQX
// Cloud, self-hosted Mosquitto, etc). Saved to AsyncStorage so it
// persists between app launches.
import React, { useEffect, useState } from "react";
import { View, Text, StyleSheet, TextInput, TouchableOpacity, ScrollView, Alert, KeyboardAvoidingView, Platform } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { loadSettings, saveSettings, onConnectionChange } from "../mqttClient";
import { DEFAULT_BROKER } from "../config";

export default function SettingsScreen() {
  const [form, setForm] = useState(DEFAULT_BROKER);
  const [saving, setSaving] = useState(false);
  const [connState, setConnState] = useState("connecting");

  useEffect(() => {
    loadSettings().then(setForm);
    const off = onConnectionChange(setConnState);
    return off;
  }, []);

  const update = (key) => (val) => setForm((f) => ({ ...f, [key]: val }));

  const onSave = async () => {
    if (!form.url || !form.url.trim()) {
      Alert.alert("Broker URL required", "Please enter a broker host or URL.");
      return;
    }
    setSaving(true);
    try {
      await saveSettings(form);
      Alert.alert("Saved", "Broker settings saved. Reconnecting…");
    } catch (e) {
      Alert.alert("Error", "Could not save settings.");
    } finally {
      setSaving(false);
    }
  };

  const onReset = () => setForm(DEFAULT_BROKER);

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined}>
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.headerTitle}>Settings</Text>
        <Text style={styles.headerSub}>Saved permanently on this device — fill once, it stays after app restarts.</Text>

        <View style={styles.statusRow}>
          <View
            style={[
              styles.statusDot,
              { backgroundColor: connState === "connected" ? colors.success : connState === "connecting" ? colors.warning : colors.danger },
            ]}
          />
          <Text style={styles.statusText}>
            {connState === "connected" ? "Connected to broker" : connState === "connecting" ? "Connecting…" : "Disconnected"}
          </Text>
        </View>

        <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
          <Text style={styles.label}>BROKER URL</Text>
          <TextInput
            style={styles.input}
            value={form.url}
            onChangeText={update("url")}
            placeholder="wss://your-broker.hivemq.cloud:8884/mqtt"
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>USERNAME (optional)</Text>
          <TextInput
            style={styles.input}
            value={form.username}
            onChangeText={update("username")}
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>PASSWORD (optional)</Text>
          <TextInput
            style={styles.input}
            value={form.password}
            onChangeText={update("password")}
            secureTextEntry
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <Text style={styles.label}>TOPIC PREFIX</Text>
          <TextInput
            style={styles.input}
            value={form.prefix}
            onChangeText={update("prefix")}
            placeholderTextColor={colors.textDim}
            autoCapitalize="none"
            autoCorrect={false}
          />

          <TouchableOpacity style={styles.saveBtn} onPress={onSave} disabled={saving}>
            <Ionicons name="save-outline" size={18} color={colors.bg} />
            <Text style={styles.saveBtnText}>{saving ? "Saving…" : "Save & Reconnect"}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetBtn} onPress={onReset}>
            <Text style={styles.resetBtnText}>Reset to default (HiveMQ public test broker)</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerTitle: { fontSize: 26, fontWeight: "800", color: colors.text, marginHorizontal: 16, marginTop: 8 },
  headerSub: { fontSize: 11, color: colors.textDim, marginHorizontal: 16, marginTop: 4 },
  statusRow: { flexDirection: "row", alignItems: "center", marginHorizontal: 16, marginTop: 8 },
  statusDot: { width: 8, height: 8, borderRadius: 4, marginRight: 6 },
  statusText: { color: colors.textDim, fontSize: 12, fontWeight: "600" },
  label: { color: colors.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginBottom: 6, marginTop: 16 },
  input: {
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 14,
  },
  saveBtn: {
    flexDirection: "row",
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 28,
  },
  saveBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15, marginLeft: 8 },
  resetBtn: { alignItems: "center", marginTop: 16, padding: 8 },
  resetBtnText: { color: colors.textDim, fontSize: 12, textDecorationLine: "underline" },
});
