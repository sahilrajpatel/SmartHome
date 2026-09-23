// src/screens/SleepConfigScreen.js
// "Night Mode" screen — opened from NodeDetailScreen's Night Mode card,
// scoped to one BOARD (nodeId) so it can cover every switch on it.
// Two independent things live here:
//
//   1) AC SLEEP CYCLE (only shown if this board has a sleep-capable
//      appliance) — cycles the AC ON for X min / OFF for Y min while
//      Sleep Mode is on, optionally restricted to a clock window (e.g.
//      all night), and now also an "auto-off after N hours" cap so the
//      whole cycle stops for good after a set number of hours instead
//      of running indefinitely — keeps the room at a steady temp
//      without needing to babysit it.
//
//   2) SWITCH CURFEW — every switch on this board, each with its own
//      on/off toggle, so the user decides exactly which ones (TV,
//      sockets, etc) should turn off PERMANENTLY at a shared fixed time
//      every night (e.g. 12:00 AM) — entirely the user's choice, switch
//      by switch.
//
// All clock times here use Hour + Min + Day/Night (instead of AM/PM) —
// Day = 5:00 AM-4:59 PM, Night = 5:00 PM-4:59 AM (night starts at sunset).
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Switch, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { SH_NODES, SH_APPLIANCES, appliancesForNode } from "../config";
import {
  onMessage,
  getLastMessage,
  sleepConfigTopicFor,
  setSleepConfig,
  curfewTopicFor,
  setCurfew,
} from "../mqttClient";
import { DayNightTimePicker, pad2 } from "../components/DayNightTime";

function Stepper({ value, display, onDec, onInc }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepperBtn} onPress={onDec}>
        <Ionicons name="remove" size={18} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{display != null ? display : value}</Text>
      <TouchableOpacity style={styles.stepperBtn} onPress={onInc}>
        <Ionicons name="add" size={18} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

export default function SleepConfigScreen({ route, navigation }) {
  // Backward compatible: accepts either { nodeId } (preferred, board-wide)
  // or an old-style { applianceId } (resolved to that appliance's board).
  const { nodeId: routeNodeId, applianceId } = route.params || {};
  const fallbackAppliance = applianceId ? SH_APPLIANCES.find((a) => a.id === applianceId) : null;
  const nodeId = routeNodeId || (fallbackAppliance ? fallbackAppliance.node : null);

  const node = SH_NODES.find((n) => n.id === nodeId);
  const appliances = nodeId ? appliancesForNode(nodeId) : [];
  const sleepAppliance = appliances.find((a) => a.sleep);

  // ---- AC sleep cycle state ----
  const [onMin, setOnMin] = useState(15);
  const [offMin, setOffMin] = useState(15);
  const [maxHours, setMaxHours] = useState(0); // 0 = no auto-off limit
  const [useWindow, setUseWindow] = useState(false);
  const [startH, setStartH] = useState(17);
  const [startM, setStartM] = useState(0);
  const [endH, setEndH] = useState(5);
  const [endM, setEndM] = useState(0);

  // ---- Switch curfew state ----
  const [curfewH, setCurfewH] = useState(0);
  const [curfewM, setCurfewM] = useState(0);
  const [curfewChannels, setCurfewChannels] = useState({}); // channel -> bool

  const [savedAt, setSavedAt] = useState(0);

  useEffect(() => {
    if (!nodeId) return;

    if (sleepAppliance) {
      const cfgTopic = sleepConfigTopicFor(sleepAppliance.node, sleepAppliance.channel, "state");
      const applyCfg = (raw) => {
        if (!raw) return;
        try {
          const cfg = JSON.parse(raw);
          if (cfg.onMin) setOnMin(cfg.onMin);
          if (cfg.offMin) setOffMin(cfg.offMin);
          setMaxHours(cfg.maxHours || 0);
          if (cfg.start && cfg.end) {
            setUseWindow(true);
            const [sh, sm] = cfg.start.split(":").map((x) => parseInt(x, 10));
            const [eh, em] = cfg.end.split(":").map((x) => parseInt(x, 10));
            if (!isNaN(sh)) setStartH(sh);
            if (!isNaN(sm)) setStartM(sm);
            if (!isNaN(eh)) setEndH(eh);
            if (!isNaN(em)) setEndM(em);
          } else {
            setUseWindow(false);
          }
        } catch (e) {
          // ignore malformed retained payload
        }
      };
      applyCfg(getLastMessage(cfgTopic));
    }

    const curfTopic = curfewTopicFor(nodeId, "state");
    const applyCurfew = (raw) => {
      if (!raw) return;
      try {
        const cfg = JSON.parse(raw);
        if (cfg.time && /^\d{1,2}:\d{2}$/.test(cfg.time)) {
          const [h, m] = cfg.time.split(":").map((x) => parseInt(x, 10));
          if (!isNaN(h)) setCurfewH(h);
          if (!isNaN(m)) setCurfewM(m);
        }
        const chMap = {};
        (cfg.channels || []).forEach((c) => {
          chMap[c] = true;
        });
        setCurfewChannels(chMap);
      } catch (e) {
        // ignore malformed retained payload
      }
    };
    applyCurfew(getLastMessage(curfTopic));

    const off = onMessage((topic, payload) => {
      if (topic === curfTopic) applyCurfew(payload);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodeId]);

  const toggleCurfewChannel = useCallback((channel) => {
    setCurfewChannels((prev) => ({ ...prev, [channel]: !prev[channel] }));
  }, []);

  const onSave = useCallback(() => {
    if (sleepAppliance) {
      setSleepConfig(sleepAppliance.node, sleepAppliance.channel, {
        onMin,
        offMin,
        maxHours,
        start: useWindow ? `${pad2(startH)}:${pad2(startM)}` : "",
        end: useWindow ? `${pad2(endH)}:${pad2(endM)}` : "",
      });
    }
    if (nodeId) {
      const channels = Object.keys(curfewChannels).filter((c) => curfewChannels[c]);
      setCurfew(nodeId, { time: `${pad2(curfewH)}:${pad2(curfewM)}`, channels });
    }
    setSavedAt(Date.now());
  }, [sleepAppliance, onMin, offMin, maxHours, useWindow, startH, startM, endH, endM, nodeId, curfewChannels, curfewH, curfewM]);

  if (!node) {
    return (
      <SafeAreaView style={styles.container} edges={["top"]}>
        <Text style={styles.hint}>Board not found.</Text>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>Night Mode · {node.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <ScrollView style={styles.body} contentContainerStyle={{ paddingBottom: 50, paddingHorizontal: 24 }}>
        {sleepAppliance && (
          <>
            <Text style={styles.section}>AC SLEEP CYCLE · {sleepAppliance.name}</Text>
            <Text style={styles.hint}>How long {sleepAppliance.name} stays ON, then OFF, each round while Sleep Mode is on.</Text>

            <View style={styles.cycleRow}>
              <View style={styles.cycleCol}>
                <Text style={styles.cycleLabel}>ON (min)</Text>
                <Stepper value={onMin} onDec={() => setOnMin((v) => Math.max(1, v - 1))} onInc={() => setOnMin((v) => Math.min(180, v + 1))} />
              </View>
              <View style={styles.cycleCol}>
                <Text style={styles.cycleLabel}>OFF (min)</Text>
                <Stepper value={offMin} onDec={() => setOffMin((v) => Math.max(1, v - 1))} onInc={() => setOffMin((v) => Math.min(180, v + 1))} />
              </View>
            </View>

            <Text style={[styles.cycleLabel, { marginTop: 22 }]}>AUTO-OFF AFTER</Text>
            <Text style={styles.hint}>
              Stops the whole cycle for good after this many hours, so the AC doesn't keep running all night unless you want it to. Off = no limit, keeps cycling.
            </Text>
            <View style={{ alignItems: "center", marginTop: 10 }}>
              <Stepper
                display={maxHours === 0 ? "Off" : `${maxHours}h`}
                onDec={() => setMaxHours((v) => Math.max(0, v - 1))}
                onInc={() => setMaxHours((v) => Math.min(12, v + 1))}
              />
            </View>

            <View style={styles.windowHeaderRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.cycleLabel}>ONLY DURING SPECIFIC HOURS</Text>
                <Text style={styles.hint}>
                  On: cycles only inside this window (e.g. all night), AC stays fully on outside it. Off: cycles anytime Sleep Mode is on.
                </Text>
              </View>
              <Switch
                value={useWindow}
                onValueChange={setUseWindow}
                trackColor={{ false: colors.border, true: colors.neonDim }}
                thumbColor={useWindow ? colors.neon : colors.textDim}
              />
            </View>

            {useWindow && (
              <View style={{ marginTop: 16 }}>
                <Text style={styles.cycleLabel}>START</Text>
                <View style={{ marginTop: 8, marginBottom: 18 }}>
                  <DayNightTimePicker hour24={startH} minute={startM} onChange={(h, m) => { setStartH(h); setStartM(m); }} />
                </View>
                <Text style={styles.cycleLabel}>END</Text>
                <View style={{ marginTop: 8 }}>
                  <DayNightTimePicker hour24={endH} minute={endM} onChange={(h, m) => { setEndH(h); setEndM(m); }} />
                </View>
              </View>
            )}
          </>
        )}

        <Text style={[styles.section, sleepAppliance && styles.sectionDivider]}>SWITCH CURFEW</Text>
        <Text style={styles.hint}>
          Pick which switches on this board should turn off permanently at a fixed time every night — e.g. TV or sockets off at midnight. You decide which ones.
        </Text>

        <Text style={[styles.cycleLabel, { marginTop: 18, textAlign: "center" }]}>TURN OFF AT</Text>
        <View style={{ marginTop: 8, marginBottom: 18 }}>
          <DayNightTimePicker hour24={curfewH} minute={curfewM} onChange={(h, m) => { setCurfewH(h); setCurfewM(m); }} />
        </View>

        <View>
          {appliances.map((a) => (
            <View key={a.id} style={styles.switchRow}>
              <Ionicons name={a.icon || "flash-outline"} size={18} color={curfewChannels[a.channel] ? colors.neon : colors.textDim} />
              <Text style={styles.switchLabel}>{a.name}</Text>
              <Switch
                value={!!curfewChannels[a.channel]}
                onValueChange={() => toggleCurfewChannel(a.channel)}
                trackColor={{ false: colors.border, true: colors.neonDim }}
                thumbColor={curfewChannels[a.channel] ? colors.neon : colors.textDim}
              />
            </View>
          ))}
          {appliances.length === 0 && <Text style={styles.hint}>No switches configured for this board.</Text>}
        </View>

        <TouchableOpacity style={styles.applyBtn} onPress={onSave}>
          <Ionicons name="save-outline" size={16} color={colors.bg} />
          <Text style={styles.applyBtnText}>Save Night Mode</Text>
        </TouchableOpacity>

        {savedAt > 0 && <Text style={styles.savedText}>Sent to board.</Text>}
      </ScrollView>
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

  body: { flex: 1, paddingTop: 20 },
  section: { color: colors.textDim, fontSize: 11, fontWeight: "800", letterSpacing: 1.2, marginTop: 4 },
  sectionDivider: { marginTop: 32, paddingTop: 22, borderTopWidth: 1, borderTopColor: colors.border },
  label: { color: colors.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 1, marginTop: 8 },
  hint: { color: colors.textDim, fontSize: 11, marginTop: 6, lineHeight: 16 },

  cycleRow: { flexDirection: "row", marginTop: 18, marginBottom: 8 },
  cycleCol: { flex: 1, alignItems: "center" },
  cycleLabel: { color: colors.textDim, fontSize: 10, fontWeight: "700", letterSpacing: 1, marginBottom: 8 },

  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardAlt,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtn: { padding: 10 },
  stepperValue: { color: colors.text, fontSize: 18, fontWeight: "800", textAlign: "center", width: 46 },

  windowHeaderRow: { flexDirection: "row", alignItems: "center", marginTop: 26, paddingTop: 18, borderTopWidth: 1, borderTopColor: colors.border },

  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 10,
    paddingHorizontal: 14,
    marginBottom: 8,
  },
  switchLabel: { flex: 1, color: colors.text, fontSize: 14, fontWeight: "600", marginLeft: 10 },

  applyBtn: {
    flexDirection: "row",
    backgroundColor: colors.accent,
    borderRadius: 14,
    paddingVertical: 14,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 30,
  },
  applyBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15, marginLeft: 8 },
  savedText: { color: colors.success, fontSize: 12, textAlign: "center", marginTop: 12, fontWeight: "600" },
});
