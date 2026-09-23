// src/screens/RemoteScreen.js
// AC + TV IR remotes, both served by the Fan Board's IR transceiver.
// Laid out like a real physical remote: big round power button on top,
// +/- rockers for temp/volume/channel, a directional pad for the TV,
// and a small grid of the other everyday buttons underneath.
// Tap a button to fire an IR code. Long-press a button to put the ESP
// into Learn Mode and capture a new code for it (point your real AC/TV
// remote at the IR receiver on the Fan Board when prompted).
import React, { useState, useEffect, useCallback } from "react";
import { View, Text, StyleSheet, TouchableOpacity, ScrollView, Alert, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors } from "../theme";
import { REMOTES } from "../config";
import { publish, onMessage, getSettings } from "../mqttClient";

function irTopics(prefix, node) {
  return {
    send: `${prefix}/${node}/ir/send`,
    learnReq: `${prefix}/${node}/ir/learn/req`,
    learnAck: `${prefix}/${node}/ir/learn/ack`,
  };
}

export default function RemoteScreen() {
  const [activeRemote, setActiveRemote] = useState(0);
  const [learning, setLearning] = useState(false);
  const [learnButton, setLearnButton] = useState(null);
  // Purely local UI state — IR is one-way (no feedback from the TV/AC),
  // so this just lets the power glyph glow after you tap it.
  const [powerOn, setPowerOn] = useState(false);

  useEffect(() => {
    setPowerOn(false);
  }, [activeRemote]);

  const settings = getSettings();
  const prefix = (settings && settings.prefix) || "smarthome";
  const remote = REMOTES[activeRemote];
  const topics = irTopics(prefix, remote.node);
  const layout = remote.layout || {};

  const byId = useCallback((id) => remote.buttons.find((b) => b.id === id), [remote]);

  useEffect(() => {
    const off = onMessage((topic, payload) => {
      if (topic === topics.learnAck) {
        setLearning(false);
        try {
          const obj = JSON.parse(payload);
          Alert.alert(
            obj.ok ? "Learned" : "Learn failed",
            obj.ok ? `Captured code for "${learnButton}".` : obj.error || "ESP did not capture a code. Try again."
          );
        } catch (e) {
          Alert.alert("Learn Mode", payload);
        }
        setLearnButton(null);
      }
    });
    return off;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [learnButton, topics.learnAck]);

  const sendButton = useCallback(
    (btn) => {
      publish(topics.send, JSON.stringify({ device: remote.name, button: btn.id }));
      if (btn.id === layout.power) setPowerOn((prev) => !prev);
    },
    [remote, topics.send, layout.power]
  );

  const startLearn = useCallback(
    (btn) => {
      setLearning(true);
      setLearnButton(btn.id);
      publish(topics.learnReq, JSON.stringify({ device: remote.name, button: btn.id }));
    },
    [remote, topics.learnReq]
  );

  const isLearningThis = (id) => learning && learnButton === id;

  return (
    <SafeAreaView style={styles.container} edges={["top"]}>
      <Text style={styles.headerTitle}>Remote</Text>

      <View style={styles.tabsRow}>
        {REMOTES.map((r, i) => (
          <TouchableOpacity
            key={r.name}
            style={[styles.tabBtn, activeRemote === i && styles.tabBtnActive]}
            onPress={() => setActiveRemote(i)}
          >
            <Text style={[styles.tabText, activeRemote === i && styles.tabTextActive]}>{r.name}</Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={styles.scrollBody} showsVerticalScrollIndicator={false}>
        {/* ---- Remote body: looks like the physical remote's plastic shell ---- */}
        <View style={styles.body}>
          {/* Power */}
          {layout.power && (
            <View style={styles.powerRow}>
              <RemoteButton
                round
                large
                power
                on={powerOn}
                btn={byId(layout.power)}
                learning={isLearningThis(layout.power)}
                onPress={() => sendButton(byId(layout.power))}
                onLongPress={() => startLearn(byId(layout.power))}
              />
            </View>
          )}

          {/* Rockers: TEMP / VOL / CH style +/- pill */}
          {(layout.rockers || []).map((r) => (
            <View key={r.label} style={styles.rockerWrap}>
              <Text style={styles.rockerLabel}>{r.label}</Text>
              <View style={styles.rockerPill}>
                <TouchableOpacity
                  style={styles.rockerHalf}
                  activeOpacity={0.7}
                  onPress={() => sendButton(byId(r.decId))}
                  onLongPress={() => startLearn(byId(r.decId))}
                >
                  {isLearningThis(r.decId) ? (
                    <ActivityIndicator color={colors.neon} />
                  ) : (
                    <Ionicons name="remove" size={22} color={colors.neon} />
                  )}
                </TouchableOpacity>
                <View style={styles.rockerDivider} />
                <TouchableOpacity
                  style={styles.rockerHalf}
                  activeOpacity={0.7}
                  onPress={() => sendButton(byId(r.incId))}
                  onLongPress={() => startLearn(byId(r.incId))}
                >
                  {isLearningThis(r.incId) ? (
                    <ActivityIndicator color={colors.neon} />
                  ) : (
                    <Ionicons name="add" size={22} color={colors.neon} />
                  )}
                </TouchableOpacity>
              </View>
            </View>
          ))}

          {/* Directional pad (TV only) */}
          {layout.pad && (
            <View style={styles.padWrap}>
              <View style={styles.padRow}>
                <View style={styles.padSpacer} />
                <PadKey icon="chevron-up" btn={byId(layout.pad.up)} learning={isLearningThis(layout.pad.up)} onPress={() => sendButton(byId(layout.pad.up))} onLongPress={() => startLearn(byId(layout.pad.up))} />
                <View style={styles.padSpacer} />
              </View>
              <View style={styles.padRow}>
                <PadKey icon="chevron-back" btn={byId(layout.pad.left)} learning={isLearningThis(layout.pad.left)} onPress={() => sendButton(byId(layout.pad.left))} onLongPress={() => startLearn(byId(layout.pad.left))} />
                <PadKey icon="ellipse" center btn={byId(layout.pad.center)} learning={isLearningThis(layout.pad.center)} onPress={() => sendButton(byId(layout.pad.center))} onLongPress={() => startLearn(byId(layout.pad.center))} />
                <PadKey icon="chevron-forward" btn={byId(layout.pad.right)} learning={isLearningThis(layout.pad.right)} onPress={() => sendButton(byId(layout.pad.right))} onLongPress={() => startLearn(byId(layout.pad.right))} />
              </View>
              <View style={styles.padRow}>
                <View style={styles.padSpacer} />
                <PadKey icon="chevron-down" btn={byId(layout.pad.down)} learning={isLearningThis(layout.pad.down)} onPress={() => sendButton(byId(layout.pad.down))} onLongPress={() => startLearn(byId(layout.pad.down))} />
                <View style={styles.padSpacer} />
              </View>
            </View>
          )}

          {/* Everyday-use buttons grid */}
          {(layout.grid || []).map((row, ri) => (
            <View key={ri} style={styles.gridRow}>
              {row.map((id) => (
                <RemoteButton
                  key={id}
                  btn={byId(id)}
                  learning={isLearningThis(id)}
                  onPress={() => sendButton(byId(id))}
                  onLongPress={() => startLearn(byId(id))}
                />
              ))}
            </View>
          ))}
        </View>
      </ScrollView>

      <Text style={styles.hint}>Tap to send · Long-press a button to teach it a new IR code (Learn Mode)</Text>
    </SafeAreaView>
  );
}

function RemoteButton({ btn, onPress, onLongPress, learning, round, large, power, on }) {
  if (!btn) return null;
  const glow = power && on;
  return (
    <TouchableOpacity
      style={[
        styles.gridBtn,
        round && styles.roundBtn,
        large && styles.largeBtn,
        power && styles.powerBtn,
      ]}
      activeOpacity={0.6}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {learning ? (
        <ActivityIndicator color={colors.neon} />
      ) : (
        <Ionicons
          name={btn.icon}
          size={large ? 30 : 20}
          color={colors.neon}
          style={glow ? styles.iconGlow : null}
        />
      )}
      {!power && <Text style={styles.gridBtnLabel}>{btn.label}</Text>}
    </TouchableOpacity>
  );
}

function PadKey({ icon, center, onPress, onLongPress, learning }) {
  return (
    <TouchableOpacity
      style={[styles.padKey, center && styles.padKeyCenter]}
      activeOpacity={0.6}
      onPress={onPress}
      onLongPress={onLongPress}
    >
      {learning ? (
        <ActivityIndicator color={colors.neon} />
      ) : (
        <Ionicons name={icon} size={center ? 14 : 22} color={colors.neon} />
      )}
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg },
  headerTitle: { fontSize: 26, fontWeight: "800", color: colors.text, marginHorizontal: 16, marginTop: 8, marginBottom: 12 },
  tabsRow: {
    flexDirection: "row",
    marginHorizontal: 16,
    marginBottom: 16,
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 4,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tabBtn: { flex: 1, paddingVertical: 10, borderRadius: 9, alignItems: "center" },
  tabBtnActive: { backgroundColor: colors.neon },
  tabText: { color: colors.textDim, fontWeight: "700", fontSize: 13 },
  tabTextActive: { color: colors.bg },

  scrollBody: { paddingHorizontal: 16, paddingBottom: 16, alignItems: "center" },

  body: {
    width: "100%",
    maxWidth: 340,
    backgroundColor: colors.card,
    borderRadius: 32,
    borderWidth: 1,
    borderColor: colors.border,
    paddingVertical: 26,
    paddingHorizontal: 20,
    alignItems: "center",
  },

  powerRow: { marginBottom: 22 },
  powerBtn: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.cardAlt,
    borderWidth: 1.5,
    borderColor: colors.neonDim,
  },
  // NOTE: gridBtn (below) sets flex:1 + aspectRatio:1.7 for the grid rows.
  // roundBtn only cleared aspectRatio, so the power button kept flex:1 and
  // stretched to fill the whole ScrollView height — that's the tall
  // vertical bar seen on screen. Killing flex/aspectRatio here fixes it.
  roundBtn: { flex: 0, aspectRatio: undefined, alignSelf: "center" },
  largeBtn: { width: 78, height: 78 },
  // Glow lives on the glyph itself (textShadow on the icon glyph), not on
  // a filled circle behind it — matches "only the symbol should glow".
  iconGlow: {
    textShadowColor: colors.neon,
    textShadowOffset: { width: 0, height: 0 },
    textShadowRadius: 14,
  },

  rockerWrap: { width: "100%", alignItems: "center", marginBottom: 20 },
  rockerLabel: { color: colors.textDim, fontSize: 11, fontWeight: "700", letterSpacing: 2, marginBottom: 8 },
  rockerPill: {
    flexDirection: "row",
    backgroundColor: colors.cardAlt,
    borderRadius: 26,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: "hidden",
    width: "80%",
  },
  rockerHalf: { flex: 1, paddingVertical: 16, alignItems: "center", justifyContent: "center" },
  rockerDivider: { width: 1, backgroundColor: colors.border },

  padWrap: { alignItems: "center", marginBottom: 22 },
  padRow: { flexDirection: "row" },
  padSpacer: { width: 54, height: 54 },
  padKey: {
    width: 54,
    height: 54,
    borderRadius: 12,
    backgroundColor: colors.cardAlt,
    borderWidth: 1,
    borderColor: colors.neonDim,
    alignItems: "center",
    justifyContent: "center",
    margin: 3,
  },
  padKeyCenter: {
    backgroundColor: colors.cardAlt,
    borderColor: colors.neon,
    borderRadius: 27,
  },

  gridRow: { flexDirection: "row", width: "100%", marginBottom: 12 },
  gridBtn: {
    flex: 1,
    aspectRatio: 1.7,
    backgroundColor: colors.cardAlt,
    borderRadius: 14,
    alignItems: "center",
    justifyContent: "center",
    marginHorizontal: 4,
    borderWidth: 1,
    borderColor: colors.neonDim,
  },
  gridBtnLabel: { color: colors.text, fontSize: 11, fontWeight: "600", marginTop: 6, textAlign: "center" },

  hint: { color: colors.textDim, fontSize: 11, textAlign: "center", marginHorizontal: 20, marginTop: 12, marginBottom: 12 },
});
