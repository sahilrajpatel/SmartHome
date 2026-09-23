// src/screens/ApplianceScheduleScreen.js
// Fresh dedicated screen (pushed from ApplianceDetailScreen's Schedule
// icon) — lets the user pick a daily clock time this appliance should
// automatically switch off at, on whichever days they choose. Board
// keeps time via NTP. Time is picked as Hour + Min + Day/Night (instead
// of AM/PM) — Day = 5:00 AM to 4:59 PM, Night = 5:00 PM to 4:59 AM,
// matching "night starts after sunset".
import React, { useEffect, useState, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { SH_APPLIANCES } from "../config";
import { onMessage, getLastMessage, topicFor, setSchedule, parseSchedule } from "../mqttClient";
import { DayNightTimePicker, DaySelector, fmtDayNight, ALL_DAYS } from "../components/DayNightTime";

export default function ApplianceScheduleScreen({ route, navigation }) {
  const { applianceId } = route.params;
  const appliance = SH_APPLIANCES.find((a) => a.id === applianceId);

  const [hh, setHh] = useState(22);
  const [mm, setMm] = useState(0);
  const [days, setDays] = useState(ALL_DAYS);
  const [active, setActive] = useState(null); // currently-saved {time, days} or null

  useEffect(() => {
    if (!appliance) return;
    const scheduleTopic = topicFor(appliance.node, appliance.channel, "schedule/state");

    const applyRaw = (raw) => {
      const parsed = parseSchedule(raw);
      setActive(parsed);
      if (parsed) {
        const [h, m] = parsed.time.split(":").map((x) => parseInt(x, 10));
        if (!isNaN(h)) setHh(h);
        if (!isNaN(m)) setMm(m);
        setDays(parsed.days);
      }
    };

    applyRaw(getLastMessage(scheduleTopic));
    const off = onMessage((topic, payload) => {
      if (topic === scheduleTopic) applyRaw(payload);
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applianceId]);

  const applySchedule = useCallback(() => {
    if (!appliance) return;
    const time = `${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}`;
    setSchedule(appliance.node, appliance.channel, time, days);
    setActive({ time, days });
  }, [appliance, hh, mm, days]);

  const cancelSchedule = useCallback(() => {
    if (!appliance) return;
    setSchedule(appliance.node, appliance.channel, "", []);
    setActive(null);
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
        <Text style={styles.headerTitle}>Schedule · {appliance.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <Text style={styles.label}>DAILY AUTO-OFF TIME</Text>
        <View style={styles.pickerWrap}>
          <DayNightTimePicker hour24={hh} minute={mm} onChange={(h, m) => { setHh(h); setMm(m); }} />
        </View>

        <Text style={[styles.label, { marginTop: 28 }]}>ON THESE DAYS</Text>
        <View style={styles.daysWrap}>
          <DaySelector days={days} onChange={setDays} />
        </View>
        {days.length === 0 && <Text style={styles.warn}>Pick at least one day, or the schedule won't run.</Text>}

        <TouchableOpacity
          style={[styles.applyBtn, days.length === 0 && styles.applyBtnDisabled]}
          onPress={applySchedule}
          disabled={days.length === 0}
        >
          <Text style={styles.applyBtnText}>Set Schedule</Text>
        </TouchableOpacity>

        {active ? (
          <View style={styles.activeRow}>
            <Ionicons name="alarm-outline" size={15} color={colors.accent} />
            <Text style={styles.activeText}>
              Switches off at {fmtDayNight(...active.time.split(":").map((x) => parseInt(x, 10)))}
              {" · "}
              {active.days.length === 7 ? "daily" : active.days.map((d) => "SMTWTFS"[d]).join(",")}
            </Text>
            <TouchableOpacity onPress={cancelSchedule}>
              <Text style={styles.cancelText}>Cancel</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.hint}>Board syncs time over NTP (Wi-Fi) — no need to set it manually.</Text>
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

  body: { flex: 1, alignItems: "center", paddingTop: 40, paddingHorizontal: 24 },
  label: { color: colors.textDim, fontSize: 13, fontWeight: "700", letterSpacing: 1, marginBottom: 16 },

  pickerWrap: { alignItems: "center" },
  daysWrap: { width: "100%", paddingHorizontal: 4 },

  warn: { color: colors.warning, fontSize: 12, marginTop: 10, fontWeight: "600" },

  applyBtn: { backgroundColor: colors.accent, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 40, marginTop: 32 },
  applyBtnDisabled: { backgroundColor: colors.cardAlt },
  applyBtnText: { color: colors.bg, fontWeight: "800", fontSize: 15 },

  activeRow: { flexDirection: "row", alignItems: "center", marginTop: 24, flexWrap: "wrap", justifyContent: "center" },
  activeText: { color: colors.text, fontSize: 13, marginLeft: 6, textAlign: "center" },
  cancelText: { color: colors.danger, fontSize: 12, fontWeight: "700", marginLeft: 14 },
  hint: { color: colors.textDim, fontSize: 12, marginTop: 24, textAlign: "center" },
});
