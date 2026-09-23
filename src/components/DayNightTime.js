// src/components/DayNightTime.js
// -----------------------------------------------------------------------
// Shared "Day / Night" clock picker used instead of a plain AM/PM picker
// everywhere the app needs the user to choose a time of day (per-switch
// daily Schedule, Night Mode's AC window, Night Mode's switch curfew).
//
// Rule (as requested): sunset onwards counts as NIGHT, sunrise onwards
// counts as DAY — fixed at 5:00 PM to 5:00 AM = Night, 5:00 AM to 5:00 PM
// = Day. This mirrors a normal 12-hour AM/PM clock (12 + 1..11, wrapping
// once per half-day) but anchored at 5/17 instead of 12/0, so picking
// "9 Night" always means 9:00 PM and "6 Day" always means 11:00 AM —
// exact 24-hour time is always recoverable from (hour12, period).
// -----------------------------------------------------------------------
import React from "react";
import { View, Text, StyleSheet, TouchableOpacity } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";

export function pad2(n) {
  return String(n).padStart(2, "0");
}

export const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
export const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];

// 17:00 (5 PM) - 04:59 (5 AM) = night, 05:00 - 16:59 = day.
export function periodFor(hour24) {
  return hour24 >= 17 || hour24 < 5 ? "night" : "day";
}

// 24h hour -> { period, hour12 (1-12) }, anchored at 5/17 instead of 0/12.
export function to12(hour24) {
  if (hour24 >= 5 && hour24 <= 16) {
    const offset = (hour24 - 5) % 12;
    return { period: "day", hour12: offset === 0 ? 12 : offset };
  }
  const shifted = (hour24 + 24 - 17) % 24;
  return { period: "night", hour12: shifted === 0 ? 12 : shifted };
}

// { hour12 (1-12), period } -> 24h hour.
export function to24(hour12, period) {
  const offset = hour12 % 12;
  return period === "day" ? (5 + offset) % 24 : (17 + offset) % 24;
}

export function fmtDayNight(hour24, minute) {
  const { period, hour12 } = to12(hour24);
  return `${hour12}:${pad2(minute)} ${period === "day" ? "Day" : "Night"}`;
}

export function summarizeSchedule(parsed) {
  if (!parsed || !parsed.time) return "";
  const [h, m] = parsed.time.split(":").map((x) => parseInt(x, 10));
  const timeLabel = fmtDayNight(h || 0, m || 0);
  const days = parsed.days && parsed.days.length ? parsed.days : ALL_DAYS;
  let daysLabel;
  if (days.length === 7) daysLabel = "daily";
  else if (days.length === 0) daysLabel = "no days";
  else
    daysLabel = days
      .slice()
      .sort((a, b) => a - b)
      .map((d) => WEEKDAYS[d])
      .join(",");
  return `${timeLabel} · ${daysLabel}`;
}

function Stepper({ value, display, onDec, onInc }) {
  return (
    <View style={styles.stepper}>
      <TouchableOpacity style={styles.stepperBtn} onPress={onDec}>
        <Ionicons name="remove" size={16} color={colors.text} />
      </TouchableOpacity>
      <Text style={styles.stepperValue}>{display != null ? display : value}</Text>
      <TouchableOpacity style={styles.stepperBtn} onPress={onInc}>
        <Ionicons name="add" size={16} color={colors.text} />
      </TouchableOpacity>
    </View>
  );
}

// Controlled: hour24 (0-23), minute (0-59), onChange(nextHour24, nextMinute).
export function DayNightTimePicker({ hour24, minute, onChange }) {
  const { period, hour12 } = to12(hour24);

  const setHour12 = (h12) => onChange(to24(h12, period), minute);
  const setPeriod = (p) => onChange(to24(hour12, p), minute);
  const setMinute = (m) => onChange(hour24, m);

  return (
    <View style={styles.row}>
      <Stepper
        display={pad2(hour12)}
        onDec={() => setHour12(hour12 === 1 ? 12 : hour12 - 1)}
        onInc={() => setHour12(hour12 === 12 ? 1 : hour12 + 1)}
      />
      <Text style={styles.colon}>:</Text>
      <Stepper
        display={pad2(minute)}
        onDec={() => setMinute((minute + 59) % 60)}
        onInc={() => setMinute((minute + 1) % 60)}
      />
      <View style={styles.periodToggle}>
        <TouchableOpacity
          style={[styles.periodBtn, period === "day" && styles.periodBtnActiveDay]}
          onPress={() => setPeriod("day")}
        >
          <Ionicons name="sunny-outline" size={13} color={period === "day" ? colors.bg : colors.textDim} />
          <Text style={[styles.periodBtnText, period === "day" && styles.periodBtnTextActive]}>Day</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.periodBtn, period === "night" && styles.periodBtnActiveNight]}
          onPress={() => setPeriod("night")}
        >
          <Ionicons name="moon-outline" size={13} color={period === "night" ? colors.bg : colors.textDim} />
          <Text style={[styles.periodBtnText, period === "night" && styles.periodBtnTextActive]}>Night</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

// Sun..Sat toggle chips. days = array of 0(Sun)-6(Sat). onChange(nextDays).
export function DaySelector({ days, onChange }) {
  const toggle = (i) => {
    const next = days.includes(i) ? days.filter((d) => d !== i) : [...days, i];
    onChange(next);
  };
  return (
    <View style={dayStyles.row}>
      {WEEKDAYS.map((d, i) => {
        const active = days.includes(i);
        return (
          <TouchableOpacity
            key={i}
            style={[dayStyles.chip, active && dayStyles.chipActive]}
            onPress={() => toggle(i)}
          >
            <Text style={[dayStyles.chipText, active && dayStyles.chipTextActive]}>{d[0]}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "center", flexWrap: "wrap", justifyContent: "center" },
  stepper: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  stepperBtn: { padding: 8 },
  stepperValue: { color: colors.text, fontSize: 16, fontWeight: "800", textAlign: "center", width: 30 },
  colon: { color: colors.text, fontSize: 16, fontWeight: "800", marginHorizontal: 6 },
  periodToggle: {
    flexDirection: "row",
    marginLeft: 10,
    marginTop: 6,
    backgroundColor: colors.cardAlt,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
  },
  periodBtn: { flexDirection: "row", alignItems: "center", paddingVertical: 8, paddingHorizontal: 10 },
  periodBtnActiveDay: { backgroundColor: colors.warning },
  periodBtnActiveNight: { backgroundColor: colors.neon },
  periodBtnText: { color: colors.textDim, fontSize: 12, fontWeight: "700", marginLeft: 4 },
  periodBtnTextActive: { color: colors.bg },
});

const dayStyles = StyleSheet.create({
  row: { flexDirection: "row", justifyContent: "space-between", width: "100%" },
  chip: {
    width: 34,
    height: 34,
    borderRadius: 17,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: "center",
    justifyContent: "center",
  },
  chipActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.textDim, fontSize: 13, fontWeight: "700" },
  chipTextActive: { color: colors.bg },
});
