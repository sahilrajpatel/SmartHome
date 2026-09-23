// src/mqttClient.js
// -----------------------------------------------------------------------
// ONE shared MQTT connection for the whole app. Every screen subscribes
// to messages/connection-state through the functions below instead of
// opening its own connection.
// -----------------------------------------------------------------------
import mqtt from "mqtt";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_BROKER, TOPIC_PREFIX_DEFAULT } from "./config";

const STORAGE_KEY = "sh_broker_settings_v1";

let client = null;
let currentSettings = null;
let connectionState = "connecting"; // connecting | connected | disconnected | error
const lastMessages = {}; // topic -> last payload string, so late-mounting screens see current state

const messageListeners = new Set();
const connectionListeners = new Set();

function notifyConnection(state) {
  connectionState = state;
  connectionListeners.forEach((cb) => {
    try {
      cb(state);
    } catch (e) {
      console.warn("[mqtt] connection listener error:", e);
    }
  });
}

function emitTopic(topic, payload) {
  lastMessages[topic] = payload;
  messageListeners.forEach((cb) => {
    try {
      cb(topic, payload);
    } catch (e) {
      console.warn("[mqtt] message listener error:", e);
    }
  });
}

export function getConnectionState() {
  return connectionState;
}

export function getLastMessage(topic) {
  return lastMessages[topic];
}

export function getSettings() {
  return currentSettings;
}

// Subscribe to every incoming MQTT message. Returns an unsubscribe fn.
export function onMessage(cb) {
  messageListeners.add(cb);
  return () => messageListeners.delete(cb);
}

// Subscribe to broker connection state changes. Fires immediately with
// the current state, then on every change. Returns an unsubscribe fn.
export function onConnectionChange(cb) {
  connectionListeners.add(cb);
  cb(connectionState);
  return () => connectionListeners.delete(cb);
}

export async function loadSettings() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEY);
    if (raw) return { ...DEFAULT_BROKER, ...JSON.parse(raw) };
  } catch (e) {
    // ignore, fall back to defaults
  }
  return { ...DEFAULT_BROKER };
}

function buildUrl(settings) {
  let url = (settings.url || "").trim() || DEFAULT_BROKER.url;
  if (!/^wss?:\/\//i.test(url)) {
    url = `wss://${url}`;
  }
  return url;
}

export function connect(settings) {
  currentSettings = settings;

  if (client) {
    try {
      client.end(true);
    } catch (e) {
      console.warn("[mqtt] error closing previous client:", e);
    }
    client = null;
  }

  notifyConnection("connecting");
  const url = buildUrl(settings);
  const opts = {
    clientId: "sh_app_" + Math.random().toString(16).slice(2, 10),
    clean: true,
    // Keepalive kam rakha hai (30s) taaki mobile-data / patchy WiFi pe
    // bhi connection jaldi "dead" detect ho aur reconnect ho jaye —
    // ghar ke bahar se access karte waqt yahi sabse zyaada matter karta
    // hai. reconnectPeriod thoda tez (3s) taaki drop hone par turant
    // wapas judne ki koshish kare.
    keepalive: 30,
    reconnectPeriod: 3000,
    connectTimeout: 10000,
    // QoS 0 subscriptions broker offline hote waqt kuch messages miss
    // kar sakti hain agar connection beech me toot jaye — resubscribe
    // "connect" handler me hai isliye har reconnect ke baad fresh
    // subscribe ho jaata hai (state turant sync ho jaata hai).
  };
  if (settings.username) opts.username = settings.username;
  if (settings.password) opts.password = settings.password;

  try {
    client = mqtt.connect(url, opts);
  } catch (e) {
    console.warn("[mqtt] connect() threw:", e);
    notifyConnection("error");
    return;
  }

  client.on("connect", () => {
    notifyConnection("connected");
    const prefix = settings.prefix || TOPIC_PREFIX_DEFAULT;
    // QoS 1 = broker guarantee karta hai delivery (kam se kam ek baar) —
    // mobile network pe short drops me bhi missed nahi hoga.
    client.subscribe(`${prefix}/#`, { qos: 1 });
  });

  client.on("reconnect", () => notifyConnection("connecting"));
  client.on("close", () => notifyConnection("disconnected"));
  client.on("offline", () => notifyConnection("disconnected"));
  client.on("error", (err) => {
    console.warn("[mqtt] connection error:", err && err.message);
    notifyConnection("error");
  });

  client.on("message", (topic, payloadBuf) => {
    emitTopic(topic, payloadBuf.toString());
  });
}

export async function saveSettings(settings) {
  await AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  connect(settings);
}

// Call once, on app start.
export async function initFromStorage() {
  const settings = await loadSettings();
  connect(settings);
}

export function publish(topic, message, opts = { qos: 1, retain: false }) {
  if (!client || connectionState !== "connected") {
    console.warn("[mqtt] publish skipped, not connected:", topic);
    return false;
  }
  client.publish(topic, String(message), opts);
  return true;
}

// Turn an appliance on/off. Publishes the command to <channel>/set AND
// immediately echoes <channel>/state locally (as if the board had
// confirmed it), so every mounted screen updates right away and stays
// correct on navigation — even before/without the physical board
// publishing its own retained state back over MQTT.
export function setPower(node, channel, on) {
  const value = on ? "1" : "0";
  publish(topicFor(node, channel, "set"), value);
  emitTopic(topicFor(node, channel, "state"), value);
}

// ---- Topic helpers, kept in one place so nothing can typo a topic ----
export function topicFor(node, channel, kind = "set") {
  const prefix = (currentSettings && currentSettings.prefix) || TOPIC_PREFIX_DEFAULT;
  return `${prefix}/${node}/${channel}/${kind}`;
}

export function statusTopicFor(node) {
  const prefix = (currentSettings && currentSettings.prefix) || TOPIC_PREFIX_DEFAULT;
  return `${prefix}/${node}/status`;
}

// Sleep Mode topics — <prefix>/<node>/<channel>/sleep/set|state
export function sleepTopicFor(node, channel, kind = "set") {
  const prefix = (currentSettings && currentSettings.prefix) || TOPIC_PREFIX_DEFAULT;
  return `${prefix}/${node}/${channel}/sleep/${kind}`;
}

export function setSleepMode(node, channel, on) {
  const value = on ? "1" : "0";
  publish(sleepTopicFor(node, channel, "set"), value);
  emitTopic(sleepTopicFor(node, channel, "state"), value);
}

// Sleep Mode CONFIG (cycle minutes, optional clock window, optional max
// runtime) — <prefix>/<node>/<channel>/sleep/config/set|state. Retained
// JSON: {"onMin":15,"offMin":15,"start":"17:00","end":"05:00","maxHours":6}
// start/end empty string = no window restriction. maxHours 0 = no limit
// (keeps cycling for as long as Sleep Mode is switched on).
export function sleepConfigTopicFor(node, channel, kind = "set") {
  const prefix = (currentSettings && currentSettings.prefix) || TOPIC_PREFIX_DEFAULT;
  return `${prefix}/${node}/${channel}/sleep/config/${kind}`;
}

export function setSleepConfig(node, channel, cfg) {
  const payload = JSON.stringify(cfg);
  publish(sleepConfigTopicFor(node, channel, "set"), payload, { qos: 1, retain: true });
  emitTopic(sleepConfigTopicFor(node, channel, "state"), payload);
}

// Daily auto-off Schedule (per switch) — <prefix>/<node>/<channel>/schedule/set|state.
// Retained JSON: {"time":"HH:MM","days":[0..6]} (0=Sun..6=Sat). Empty
// string "" clears the schedule. Old plain "HH:MM" retained payloads
// (from before day-selection existed) are still understood by
// parseSchedule() below as "every day".
export function setSchedule(node, channel, time, days) {
  const payload = time ? JSON.stringify({ time, days: days && days.length ? days : [0, 1, 2, 3, 4, 5, 6] }) : "";
  publish(topicFor(node, channel, "schedule/set"), payload);
  emitTopic(topicFor(node, channel, "schedule/state"), payload);
}

export function parseSchedule(raw) {
  if (!raw) return null;
  try {
    const obj = JSON.parse(raw);
    if (obj && obj.time) {
      return { time: obj.time, days: Array.isArray(obj.days) && obj.days.length ? obj.days : [0, 1, 2, 3, 4, 5, 6] };
    }
  } catch (e) {
    if (/^\d{1,2}:\d{2}$/.test(raw)) return { time: raw, days: [0, 1, 2, 3, 4, 5, 6] };
  }
  return null;
}

// Night Mode "Switch Curfew" (per BOARD, covers every switch on it) —
// <prefix>/<node>/curfew/set|state. Retained JSON:
// {"time":"HH:MM","channels":["relay2","relay3"]} — every channel listed
// gets forced OFF (permanently, until manually turned back on) at that
// clock time, daily. Which switches are included is entirely up to the
// user (picked per-channel in the Night Mode screen).
export function curfewTopicFor(node, kind = "set") {
  const prefix = (currentSettings && currentSettings.prefix) || TOPIC_PREFIX_DEFAULT;
  return `${prefix}/${node}/curfew/${kind}`;
}

export function setCurfew(node, cfg) {
  const payload = JSON.stringify(cfg);
  publish(curfewTopicFor(node, "set"), payload, { qos: 1, retain: true });
  emitTopic(curfewTopicFor(node, "state"), payload);
}

// WiFi multi-network config — <prefix>/<node>/wifi/list/set|state.
// "set"   (app -> board): JSON array [{ssid,password}, ...] — REPLACES the
//         board's whole saved-network list; it tries all of them and
//         auto-connects to whichever is in range. Also how you change a
//         network's password after the router's WiFi password changes —
//         no re-flashing the ESP needed.
// "state" (board -> app, retained): {"networks":["ssid1",...],"connected":"ssid_in_use"}
//         — the board never echoes passwords back, only SSIDs + which one
//         it's connected to right now.
export function wifiListTopicFor(node, kind = "set") {
  const prefix = (currentSettings && currentSettings.prefix) || TOPIC_PREFIX_DEFAULT;
  return `${prefix}/${node}/wifi/list/${kind}`;
}

// networks: [{ ssid, password }, ...]. Retained + QoS 1 so the board picks
// it up even if it (re)connects to the broker a moment after this is sent.
export function setWifiList(node, networks) {
  const payload = JSON.stringify(networks.map((n) => ({ ssid: n.ssid, password: n.password || "" })));
  publish(wifiListTopicFor(node, "set"), payload, { qos: 1, retain: true });
}
