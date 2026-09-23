// src/screens/SplashScreen.js
// Shown when the app opens.
//
// Sequence:
//   1) SHATTER — the Patel logo breaks apart into tiles and flies outward.
//   2) REASSEMBLE — the tiles fly back together and re-form the logo.
//   3) BLINK — once whole again, the logo pulses (opacity blink) briefly
//      while we check the backend.
//
// Opening rule (no "Continue anyway" link, no long wait):
//   - If the broker is connected AND at least one ESP board is already
//     reporting online, the splash closes right away.
//   - Otherwise, the splash closes on its own after a short RANDOM delay
//     that is always under 3 seconds (a different wait every launch), so
//     the user is never stuck staring at a loading screen.
import React, { useEffect, useRef, useState, useMemo } from "react";
import { View, Text, StyleSheet, Animated, Image, Easing } from "react-native";
import { StatusBar } from "expo-status-bar";
import { colors } from "../theme";
import { SH_NODES } from "../config";
import { onConnectionChange, onMessage, statusTopicFor, getLastMessage } from "../mqttClient";

const LOGO = require("../assets/logo.png");
const LOGO_RATIO = 458 / 449;
const DISPLAY_WIDTH = 200;
const DISPLAY_HEIGHT = DISPLAY_WIDTH / LOGO_RATIO;

// ---- Shatter grid ----
const GRID_COLS = 5;
const GRID_ROWS = 5;
const TILE_W = DISPLAY_WIDTH / GRID_COLS;
const TILE_H = DISPLAY_HEIGHT / GRID_ROWS;

const BREAK_OUT_MS = 480; // assembled -> scattered
const REASSEMBLE_MS = 780; // scattered -> assembled (with a little overshoot)
const SETTLE_PAUSE_MS = 150; // brief hold once whole again, before blink starts

// Hard rule: whatever happens, the splash never blocks the user past 3s.
// A different random wait is picked on every launch so it doesn't feel
// robotic, but it always resolves comfortably under the 3000ms ceiling.
const MAX_AUTO_OPEN_MS = 2800;
const MIN_AUTO_OPEN_MS = 700;
const ONLINE_SETTLE_MS = 180; // tiny pause so the "Connected" blink isn't cut off mid-frame

function parseOnline(payload) {
  if (!payload) return false;
  try {
    const obj = JSON.parse(payload);
    return obj.online === true;
  } catch (e) {
    return payload === "online" || payload === "1";
  }
}

// Random-but-deterministic-per-mount scatter target for one tile.
function randomShard() {
  const angle = Math.random() * Math.PI * 2;
  const dist = 90 + Math.random() * 140; // px flung outward
  return {
    dx: Math.cos(angle) * dist,
    dy: Math.sin(angle) * dist,
    rot: (Math.random() - 0.5) * 220, // degrees
    scale: 0.55 + Math.random() * 0.25,
  };
}

export default function SplashScreen({ onFinish }) {
  // 0 = fully assembled/whole, 1 = fully scattered/shattered
  const shatter = useRef(new Animated.Value(0)).current;
  const blink = useRef(new Animated.Value(1)).current;
  const loopRef = useRef(null);

  const [phase, setPhase] = useState("shatter"); // shatter -> blink
  const [brokerConnected, setBrokerConnected] = useState(false);
  const [nodeOnline, setNodeOnline] = useState({});
  const finishedRef = useRef(false);

  // Random flight path for every tile, generated once per mount.
  const shards = useMemo(() => Array.from({ length: GRID_COLS * GRID_ROWS }, () => randomShard()), []);

  // A fresh random auto-open delay every time the splash mounts — always
  // under 3 seconds, never the same number twice in a row.
  const autoOpenDelay = useMemo(() => MIN_AUTO_OPEN_MS + Math.random() * (MAX_AUTO_OPEN_MS - MIN_AUTO_OPEN_MS), []);

  const finish = () => {
    if (finishedRef.current) return;
    finishedRef.current = true;
    if (loopRef.current) loopRef.current.stop();
    if (onFinish) onFinish();
  };

  // Phase 1+2: break apart, then reassemble. Runs once, unconditionally,
  // then hands off to the blink phase.
  useEffect(() => {
    const seq = Animated.sequence([
      Animated.timing(shatter, {
        toValue: 1,
        duration: BREAK_OUT_MS,
        easing: Easing.out(Easing.cubic),
        useNativeDriver: true,
      }),
      Animated.timing(shatter, {
        toValue: 0,
        duration: REASSEMBLE_MS,
        easing: Easing.out(Easing.back(1.4)),
        useNativeDriver: true,
      }),
    ]);
    seq.start(() => {
      setTimeout(() => setPhase("blink"), SETTLE_PAUSE_MS);
    });
    return () => seq.stop();
  }, []);

  // Phase 3: blink loop, once the logo is whole again.
  useEffect(() => {
    if (phase !== "blink") return;
    loopRef.current = Animated.loop(
      Animated.sequence([
        Animated.timing(blink, { toValue: 0.25, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
        Animated.timing(blink, { toValue: 1, duration: 550, easing: Easing.inOut(Easing.ease), useNativeDriver: true }),
      ])
    );
    loopRef.current.start();
    return () => {
      if (loopRef.current) loopRef.current.stop();
    };
  }, [phase]);

  // Track real backend connection state: broker + every board's status topic.
  useEffect(() => {
    const initial = {};
    SH_NODES.forEach((n) => {
      initial[n.id] = parseOnline(getLastMessage(statusTopicFor(n.id)));
    });
    setNodeOnline(initial);

    const offConn = onConnectionChange((state) => setBrokerConnected(state === "connected"));
    const offMsg = onMessage((topic, payload) => {
      SH_NODES.forEach((n) => {
        if (topic === statusTopicFor(n.id)) {
          setNodeOnline((prev) => ({ ...prev, [n.id]: parseOnline(payload) }));
        }
      });
    });

    // Safety net: open on its own within the random <3s window no matter
    // what the connection state is.
    const autoTimer = setTimeout(finish, autoOpenDelay);

    return () => {
      offConn();
      offMsg();
      clearTimeout(autoTimer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Fast path: the moment the broker is connected AND at least one board
  // is confirmed online, open immediately (small settle so it doesn't cut
  // the animation off mid-frame).
  useEffect(() => {
    const anyOnline = SH_NODES.some((n) => nodeOnline[n.id]);
    if (brokerConnected && anyOnline) {
      const t = setTimeout(finish, ONLINE_SETTLE_MS);
      return () => clearTimeout(t);
    }
  }, [brokerConnected, nodeOnline]);

  const anyOnline = SH_NODES.some((n) => nodeOnline[n.id]);

  return (
    <View style={styles.container}>
      <StatusBar style="light" />

      {phase === "shatter" ? (
        <View style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT }}>
          {shards.map((shard, i) => {
            const row = Math.floor(i / GRID_COLS);
            const col = i % GRID_COLS;
            const translateX = shatter.interpolate({ inputRange: [0, 1], outputRange: [0, shard.dx] });
            const translateY = shatter.interpolate({ inputRange: [0, 1], outputRange: [0, shard.dy] });
            const rotate = shatter.interpolate({ inputRange: [0, 1], outputRange: ["0deg", `${shard.rot}deg`] });
            const scale = shatter.interpolate({ inputRange: [0, 1], outputRange: [1, shard.scale] });
            const opacity = shatter.interpolate({ inputRange: [0, 0.25, 1], outputRange: [1, 0.9, 0.55] });

            return (
              <Animated.View
                key={i}
                style={{
                  position: "absolute",
                  left: col * TILE_W,
                  top: row * TILE_H,
                  width: TILE_W,
                  height: TILE_H,
                  overflow: "hidden",
                  opacity,
                  transform: [{ translateX }, { translateY }, { rotate }, { scale }],
                }}
              >
                <Image
                  source={LOGO}
                  resizeMode="stretch"
                  style={{
                    position: "absolute",
                    left: -col * TILE_W,
                    top: -row * TILE_H,
                    width: DISPLAY_WIDTH,
                    height: DISPLAY_HEIGHT,
                  }}
                />
              </Animated.View>
            );
          })}
        </View>
      ) : (
        <Animated.Image
          source={LOGO}
          resizeMode="contain"
          style={{ width: DISPLAY_WIDTH, height: DISPLAY_HEIGHT, opacity: blink }}
        />
      )}

      <Text style={styles.tagline}>SMARTHOME HUB</Text>
      <Text style={styles.status}>
        {phase === "shatter" ? " " : !brokerConnected ? "Connecting to broker…" : anyOnline ? "Connected" : "Waiting for devices…"}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  tagline: { marginTop: 22, fontSize: 13, color: colors.textDim, letterSpacing: 3, textTransform: "uppercase", fontWeight: "700" },
  status: { marginTop: 10, fontSize: 12, color: colors.textDim },
});
