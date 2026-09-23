// src/screens/ApplianceTimerScreen.js
// Fresh dedicated screen (pushed from ApplianceDetailScreen's Timer
// icon) — lets the user set a free-form auto-off duration for this
// appliance: any amount of time they want, starting from 5 seconds,
// not a fixed list of presets.
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { SH_APPLIANCES } from "../config";
import { publish, onMessage, topicFor, getLastMessage } from "../mqttClient";

const MIN_TOTAL_SECS = 5;

function fmtRemaining(secs) {
  if (!secs || secs <= 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.floor((secs % 3600) / 60);
  const s = secs % 60;
  const parts = [];
  if (h > 0) parts.push(`${h}h`);
  if (m > 0) parts.push(`${m}m`);
  if (s > 0 || parts.length === 0) parts.push(`${s}s`);
  return parts.join(" ") + " left";
}

function Stepper({ value, onDec, onInc, max }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepperBtn} onPress={onDec}>
        <Ionicons name="remove" size={18} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{String(value).padStart(2, "0")}</Text>
      <TouchableOpacity style={styles.stepperBtn} onPress={onInc}>
        <Ionicons name="add" size={18} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

export default function ApplianceTimerScreen({ route, navigation }) {
  const { applianceId } = route.params;
  const appliance = SH_APPLIANCES.find((a) => a.id === applianceId);

  const [hh, setHh] = useState(0);
  const [mm, setMm] = useState(5);
  const [ss, setSs] = useState(0);
  const [timerRemaining, setTimerRemaining] = useState(0);

  useEffect(() => {
    if (!appliance) return;
    const timerTopic = topicFor(appliance.node, appliance.channel, "timer/state");
    const raw = getLastMessage(timerTopic);
    setTimerRemaining(raw ? parseInt(raw, 10) || 0 : 0);

    const off = onMessage((topic, payload) => {
      if (topic === timerTopic) setTimerRemaining(parseInt(payload, 10) || 0);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applianceId]);

  const totalSecs = hh * 3600 + mm * 60 + ss;
  const belowMin = totalSecs < MIN_TOTAL_SECS;

  const applyTimer = useCallback(() => {
    if (!appliance || belowMin) return;
    publish(topicFor(appliance.node, appliance.channel, "timer/set"), String(totalSecs));
    setTimerRemaining(totalSecs);
  }, [appliance, totalSecs, belowMin]);

  const cancelTimer = useCallback(() => {
    if (!appliance) return;
    publish(topicFor(appliance.node, appliance.channel, "timer/set"), "0");
    setTimerRemaining(0);
  }, [appliance]);

  if (!appliance) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.hint}>Appliance not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Timer · {appliance.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>Turn off after</Text>

        <View style={styles.pickerRow}>
          <View style={styles.pickerCol}>
            <Stepper value={hh} onDec={() => setHh((v) => Math.max(0, v - 1))} onInc={() => setHh((v) => Math.min(23, v + 1))} />
            <Text style={styles.unitLabel}>hours</Text>
          </View>
          <View style={styles.pickerCol}>
            <Stepper value={mm} onDec={() => setMm((v) => Math.max(0, v - 1))} onInc={() => setMm((v) => Math.min(59, v + 1))} />
            <Text style={styles.unitLabel}>min</Text>
          </View>
          <View style={styles.pickerCol}>
            <Stepper value={ss} onDec={() => setSs((v) => Math.max(0, v - 1))} onInc={() => setSs((v) => Math.min(59, v + 1))} />
            <Text style={styles.unitLabel}>sec</Text>
          </View>
        </View>

        {belowMin && <Text style={styles.warn}>Minimum duration is 5 seconds.</Text>}

        <TouchableOpacity style={[styles.applyBtn, belowMin && styles.applyBtnDisabled]} onPress={applyTimer} disabled={belowMin}>
          <Text style={styles.applyBtnText}>Set Timer</Text>
        </TouchableOpacity>

        {timerRemaining > 0 ? (
          <View style={styles.activeRow}>
            <Ionicons name="timer-outline" size={15} color={colors.accent} />
            <Text style={styles.activeText}>{fmtRemaining(timerRemaining)}</Text>
            <TouchableOpacity onPress={cancelTimer}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hint}>No auto-off timer running.</Text>
        )}
      </View>
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
    paddingBottom: 4,
  },
  backBtn: { padding: 8 },
  headerTitle: { color: colors.text, fontSize: 17, fontWeight: "700" },

  body: { flex: 1, alignItems: "center", paddingTop: 50, paddingHorizontal: 24 },
  label: { color: colors.textDim, fontSize: 13, fontWeight: "700", letterSpacing: 1, marginBottom: 24 },

  pickerRow: { flexDirection: "row", alignItems: "flex-start" },
  pickerCol: { alignItems: "center", marginHorizontal: 10 },
  unitLabel: { color: colors.textDim, fontSize: 11, fontWeight: "600", marginTop: 8 },

  stepper: {
    alignItems: "center",
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 6,
  },
  stepperBtn: { padding: 10 },
  stepperValue: { color: colors.text, fontSize: 22, fontWeight: "800", textAlign: "center", width: 56 },

  warn: { color: colors.warning, fontSize: 12, marginTop: 16, fontWeight: "600" },

  applyBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 32 },
  applyBtnDisabled: { backgroundColor: colors.cardAlt },
  applyBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },

  activeRow: { flexDirection: "row", alignItems: "center", marginTop: 24 },
  activeText: { color: colors.text, fontSize: 13, marginLeft: 6 },
  cancelText: { color: colors.danger, fontSize: 12, fontWeight: "700", marginLeft: 14 },
  hint: { color: colors.textDim, fontSize: 12, marginTop: 24 },
});
