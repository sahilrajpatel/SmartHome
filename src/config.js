// src/config.js
// -----------------------------------------------------------------------
// EVERYTHING device-related lives here. To add a new ESP board, a new
// switch/relay, or a new remote button, you only ever need to edit this
// file — no screen file needs to change.
// -----------------------------------------------------------------------

// ---- Default MQTT broker ----
// Pre-filled with your HiveMQ Cloud instance's TLS WebSocket URL (from
// the HiveMQ Cloud "Connect" tab: Overview -> TLS Websocket URL). This
// is already a secure (wss://, TLS-encrypted) connection.
//
// HiveMQ Cloud ALWAYS requires a username + password (Access Management
// tab -> create credentials) — fill those into the Settings tab in the
// app once; they're saved permanently on-device (AsyncStorage) so you
// only ever have to type them once.
export const DEFAULT_BROKER = {
  url: "wss://f4a2080940a6437ebf6500cb6f9b15e1.s1.eu.hivemq.cloud:8884/mqtt",
  username: "",
  password: "",
  prefix: "smarthome",
};

export const TOPIC_PREFIX_DEFAULT = "smarthome";

// ---- ESP boards on the network ----
// id = the <node> segment used in every MQTT topic for this board.
//
//   tvboard  -> 4 relays: AC, TV, Socket 1, Socket 2
//   fanboard -> 4 relays: Bulb 1, Bulb 2, Fan, Socket
//               + IR blaster/receiver -> works as the AC + TV remote
export const SH_NODES = [
  { id: "tvboard", name: "TV Board" },
  { id: "fanboard", name: "Fan Board" },
];

// ---- Every switch-controllable appliance in the house ----
// node    -> must match an id in SH_NODES
// channel -> the MQTT channel segment, e.g. topic:
//            <prefix>/<node>/<channel>/set    (app -> ESP)
//            <prefix>/<node>/<channel>/state  (ESP -> app)
//
// features:
//   timer    -> "turn off after X" one-shot countdown
//   schedule -> "auto-off daily at HH:MM, on chosen days" (ESP keeps
//               time via NTP). Retained payload on <channel>/schedule/set
//               is JSON: {"time":"HH:MM","days":[0..6]} (0=Sun..6=Sat),
//               or "" to clear. Board must OR-decode this same shape.
//   sleep    -> AC-only: cycles ON/OFF while the appliance is on.
//               <channel>/sleep/set = "1"/"0" toggles it. Cycle minutes,
//               optional clock window and optional max-runtime cap are
//               configured separately via <channel>/sleep/config/set,
//               JSON: {"onMin":15,"offMin":15,"start":"HH:MM","end":"HH:MM",
//               "maxHours":6} (start/end "" = no window, maxHours 0 = no cap).
//
// Night Mode "Switch Curfew" (any switch, not just AC) is a per-BOARD
// (not per-appliance) retained topic: <prefix>/<node>/curfew/set, JSON:
// {"time":"HH:MM","channels":["relay2","relay3"]} — board should force
// every listed channel OFF at that clock time daily.
export const SH_APPLIANCES = [
  // tvboard — 4 relay (ESP8266, firmware/esp1_tv_board): AC, TV, Socket 1, Socket 2
  { id: "tvboard_ac", node: "tvboard", channel: "relay1", name: "AC", icon: "snow-outline", timer: true, schedule: true, sleep: true },
  { id: "tvboard_tv", node: "tvboard", channel: "relay2", name: "TV", icon: "tv-outline", timer: true, schedule: true },
  { id: "tvboard_socket1", node: "tvboard", channel: "relay3", name: "Socket 1", icon: "flash-outline", timer: true, schedule: true },
  { id: "tvboard_socket2", node: "tvboard", channel: "relay4", name: "Socket 2", icon: "flash-outline", timer: true, schedule: true },

  // fanboard — 2 bulbs, 1 fan, 1 socket
  { id: "fanboard_bulb1", node: "fanboard", channel: "relay1", name: "Bulb 1", icon: "bulb-outline", timer: true, schedule: true },
  { id: "fanboard_bulb2", node: "fanboard", channel: "relay2", name: "Bulb 2", icon: "bulb-outline", timer: true, schedule: true },
  { id: "fanboard_fan1", node: "fanboard", channel: "relay3", name: "Fan", icon: "sync-outline", timer: true, schedule: true },
  { id: "fanboard_socket1", node: "fanboard", channel: "relay4", name: "Socket", icon: "flash-outline", timer: true, schedule: true },
];

export function appliancesForNode(nodeId) {
  return SH_APPLIANCES.filter((a) => a.node === nodeId);
}

// ---- Rooms ----
// A room groups one or more boards (SH_NODES) together, so the app's
// front page shows rooms instead of raw boards. Right now the house
// only has one room wired up — add more rooms here as boards get
// installed elsewhere (kitchen, bedroom, etc.) by listing their node
// ids under a new room entry.
export const ROOMS = [
  { id: "living_room", name: "Living Room", icon: "tv-outline", nodes: ["tvboard", "fanboard"] },
];

export function nodesForRoom(roomId) {
  const room = ROOMS.find((r) => r.id === roomId);
  if (!room) return [];
  return SH_NODES.filter((n) => room.nodes.includes(n.id));
}

export function applianceCountForRoom(roomId) {
  return nodesForRoom(roomId).reduce((sum, n) => sum + appliancesForNode(n.id).length, 0);
}

// ---- IR Remotes (fanboard handles IR blasting + learning) ----
// Every button still just fires { device, button } over the same
// ir/send topic — the extra "layout" block below only tells RemoteScreen
// how to arrange the buttons so it looks like a real physical remote
// (big round power key, +/- rockers, a directional pad, etc). Only the
// buttons people actually use day-to-day are included, to keep it clean.
export const AC_REMOTE = {
  name: "AC Remote",
  node: "fanboard",
  buttons: [
    { id: "power", label: "Power", icon: "power" },
    { id: "temp_up", label: "Temp +", icon: "add" },
    { id: "temp_down", label: "Temp -", icon: "remove" },
    { id: "mode", label: "Mode", icon: "options-outline" },
    { id: "fan", label: "Fan", icon: "speedometer-outline" },
    { id: "swing", label: "Swing", icon: "swap-vertical-outline" },
    { id: "sleep", label: "Sleep", icon: "moon-outline" },
    { id: "turbo", label: "Turbo", icon: "flash-outline" },
  ],
  layout: {
    power: "power",
    rockers: [{ label: "TEMP", decId: "temp_down", incId: "temp_up" }],
    pad: null,
    grid: [
      ["mode", "fan"],
      ["swing", "sleep"],
      ["turbo"],
    ],
  },
};

export const TV_REMOTE = {
  name: "TV Remote",
  node: "fanboard",
  buttons: [
    { id: "power", label: "Power", icon: "power" },
    { id: "vol_up", label: "Vol +", icon: "add" },
    { id: "vol_down", label: "Vol -", icon: "remove" },
    { id: "ch_up", label: "Ch +", icon: "add" },
    { id: "ch_down", label: "Ch -", icon: "remove" },
    { id: "nav_up", label: "Up", icon: "chevron-up" },
    { id: "nav_down", label: "Down", icon: "chevron-down" },
    { id: "nav_left", label: "Left", icon: "chevron-back" },
    { id: "nav_right", label: "Right", icon: "chevron-forward" },
    { id: "ok", label: "OK", icon: "ellipse" },
    { id: "back", label: "Back", icon: "arrow-undo-outline" },
    { id: "home", label: "Home", icon: "home-outline" },
    { id: "mute", label: "Mute", icon: "volume-mute-outline" },
    { id: "source", label: "Source", icon: "tv-outline" },
  ],
  layout: {
    power: "power",
    rockers: [
      { label: "VOL", decId: "vol_down", incId: "vol_up" },
      { label: "CH", decId: "ch_down", incId: "ch_up" },
    ],
    pad: { up: "nav_up", down: "nav_down", left: "nav_left", right: "nav_right", center: "ok" },
    grid: [
      ["back", "home"],
      ["mute", "source"],
    ],
  },
};

export const REMOTES = [AC_REMOTE, TV_REMOTE];
