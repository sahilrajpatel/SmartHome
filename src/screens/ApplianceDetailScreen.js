// src/screens/ApplianceDetailScreen.js
// Opened by tapping a switch tile (Board grid) or a row in the
// Appliances tab. Just the essentials, market-app style:
//   - one big round power button that glows green when ON, and goes
//     dark/dim with no glow when OFF
//   - two icon buttons below it — Timer and Schedule — that each open
//     their own fresh screen (ApplianceTimerScreen / ApplianceScheduleScreen)
import React, { useEffect, useState, useCallback, useRef } from "react";
import { View, Text, StyleSheet, TouchableOpacity, Animated } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { SH_APPLIANCES } from "../config";
import { setPower, onMessage, topicFor, getLastMessage, parseSchedule } from "../mqttClient";
import { fmtDayNight } from "../components/DayNightTime";

function fmtRemaining(secs) {
  if (!secs || secs <= 0) return null;
  const h = Math.floor(secs / 3600);
  const m = Math.round((secs % 3600) / 60);
  const s = secs % 60;
  if (h > 0) return `${h}h ${m}m left`;
  if (m > 0) return `${m}m ${s}s left`;
  return `${s}s left`;
}

export default function ApplianceDetailScreen({ route, navigation }) {
  const { applianceId } = route.params;
  const appliance = SH_APPLIANCES.find((a) => a.id === applianceId);

  const [poweredOn, setPoweredOn] = useState(false);
  const [timerRemaining, setTimerRemaining] = useState(0);
  const [scheduleTime, setScheduleTime] = useState("");

  useEffect(() => {
    if (!appliance) return;

    const stateTopic = topicFor(appliance.node, appliance.channel, "state");
    const timerTopic = topicFor(appliance.node, appliance.channel, "timer/state");
    const scheduleTopic = topicFor(appliance.node, appliance.channel, "schedule/state");

    const rawState = getLastMessage(stateTopic);
    setPoweredOn(rawState === "1" || rawState === "ON" || rawState === "on");

    const rawTimer = getLastMessage(timerTopic);
    setTimerRemaining(rawTimer ? parseInt(rawTimer, 10) || 0 : 0);

    const rawSchedule = getLastMessage(scheduleTopic);
    setScheduleTime(rawSchedule || "");

    const off = onMessage((topic, payload) => {
      if (topic === stateTopic) setPoweredOn(payload === "1" || payload === "ON" || payload === "on");
      else if (topic === timerTopic) setTimerRemaining(parseInt(payload, 10) || 0);
      else if (topic === scheduleTopic) setScheduleTime(payload || "");
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [applianceId]);

  const togglePower = useCallback(() => {
    if (!appliance) return;
    setPoweredOn((prev) => {
      const next = !prev;
      setPower(appliance.node, appliance.channel, next);
      return next;
    });
  }, [appliance]);

  const openTimer = useCallback(
    () => navigation.navigate("ApplianceTimer", { applianceId }),
    [navigation, applianceId]
  );
  const openSchedule = useCallback(
    () => navigation.navigate("ApplianceSchedule", { applianceId }),
    [navigation, applianceId]
  );

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
        <Text style={styles.headerTitle}>{appliance.name}</Text>
        <View style={{ width: 24 }} />
      </View>

      <View style={styles.body}>
        <GlowPowerButton on={poweredOn} icon={appliance.icon} onToggle={togglePower} />
        <Text style={styles.name}>{appliance.name}</Text>
        <Text style={styles.status}>{poweredOn ? "Currently ON" : "Currently OFF"}</Text>

        {(timerRemaining > 0 || scheduleTime) && (
          <View style={styles.activeSummary}>
            {timerRemaining > 0 && (
              <View style={styles.activeChip}>
                <Ionicons name="timer-outline" size={13} color={colors.accent} />
                <Text style={styles.activeChipText}>{fmtRemaining(timerRemaining)}</Text>
              </View>
            )}
            {!!scheduleTime && (() => {
              const parsed = parseSchedule(scheduleTime);
              if (!parsed) return null;
              const [h, m] = parsed.time.split(":").map((x) => parseInt(x, 10));
              const daysLabel = parsed.days.length === 7 ? "daily" : parsed.days.map((d) => "SMTWTFS"[d]).join(",");
              return (
                <View style={styles.activeChip}>
                  <Ionicons name="alarm-outline" size={13} color={colors.accent} />
                  <Text style={styles.activeChipText}>Off {fmtDayNight(h, m)} · {daysLabel}</Text>
                </View>
              );
            })()}
          </View>
        )}

        <View style={styles.iconRow}>
          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.75} onPress={openTimer}>
            <View style={styles.iconCircle}>
              <Ionicons name="timer-outline" size={22} color={colors.text} />
            </View>
            <Text style={styles.iconBtnLabel}>Timer</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.iconBtn} activeOpacity={0.75} onPress={openSchedule}>
            <View style={styles.iconCircle}>
              <Ionicons name="alarm-outline" size={22} color={colors.text} />
            </View>
            <Text style={styles.iconBtnLabel}>Schedule</Text>
          </TouchableOpacity>
        </View>
      </View>
    </SafeAreaView>
  );
}

// Round power button — dim/gray with no glow when OFF. When ON, only
// the power glyph itself glows neon blue (textShadow on the icon) —
// no separate filled/ringed circle appears behind it.
const BTN_SIZE = 140;

function GlowPowerButton({ on, icon, onToggle }) {
  const anim = useRef(new Animated.Value(on ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(anim, { toValue: on ? 1 : 0, duration: 250, useNativeDriver: false }).start();
  }, [on, anim]);

  const ringColor = anim.interpolate({ inputRange: [0, 1], outputRange: [colors.border, colors.neonDim] });

  return (
    <View style={styles.glowWrap}>
      <TouchableOpacity activeOpacity={0.8} onPress={onToggle}>
        <Animated.View style={[styles.btnCircle, { borderColor: ringColor }]}>
          <Ionicons
            name="power"
            size={54}
            color={on ? colors.neon : colors.textDim}
            style={on ? styles.iconGlow : null}
          />
        </Animated.View>
      </TouchableOpacity>
    </View>
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
  headerTitle: { color: colors.text, fontSize: 18, fontWeight: "700" },

  body: { flex: 1, alignItems: "center", justifyContent: "center", paddingBottom: 60 },

  glowWrap: { width: BTN_SIZE, height: BTN_SIZE, alignItems: "center", justifyContent: "center" },
  btnCircle: {
    width: BTN_SIZE,
    height: BTN_SIZE,
    borderRadius: BTN_SIZE / 2,
    backgroundColor: colors.card,
    borderWidth: 2,
    alignItems: "center",
    justifyContent: "center",
  },
  // Glow lives on the glyph itself (textShadow), not on a filled/ringed
  // circle behind it.
  iconGlow: {
    textShadowColor: colors.neon,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 16,
  },

  name: { color: colors.text, fontSize: 20, fontWeight: "800", marginTop: 22 },
  status: { color: colors.textDim, fontSize: 13, marginTop: 4 },

  activeSummary: { flexDirection: "row", flexWrap: "wrap", justifyContent: "center", marginTop: 14, paddingHorizontal: 20 },
  activeChip: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 20,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginHorizontal: 4,
    marginTop: 6,
  },
  activeChipText: { color: colors.text, fontSize: 12, marginLeft: 5, fontWeight: "600" },

  iconRow: { flexDirection: "row", marginTop: 40 },
  iconBtn: { alignItems: "center", marginHorizontal: 22 },
  iconCircle: {
    width: 54,
    height: 54,
    borderRadius: 27,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  iconBtnLabel: { color: colors.textDim, fontSize: 12, fontWeight: "600", marginTop: 8 },

  hint: { color: colors.textDim, fontSize: 11, textAlign: "center", marginTop: 40 },
});
