# SmartHome Hub (Patel)

A mobile app (Expo / React Native) to control your entire home's switches, fan, AC and TV — from anywhere in the world — paired with two ESP8266 boards that do the actual switching. Built on MQTT, so it works over WiFi at home and over the internet when you're away.

## Features

- **Remote control from anywhere** — app talks to the boards over MQTT, not local WiFi only, so it works from outside the house too
- **App-based ON/OFF** for every switch in the house
- **Auto-off timer** per appliance — 15m / 30m / 1h / 2h presets
- **Daily schedule** — set a time (HH:MM) and the board auto-turns the appliance off every day at that time
- **Sleep Mode for AC** — cycles the AC 15 min ON / 15 min OFF automatically while enabled
- **IR remote for AC & TV** — control them from the app like a normal remote, plus a **Learn Mode** to teach it your actual remote's buttons
- **Live online/offline status** for each board, shown right on the dashboard
- **Multi-WiFi support per board** — save multiple networks from the app; board auto-connects to whichever is available and switches over if one drops. First-time setup (no saved WiFi at all) is done via the board's own hotspot, no reflashing needed
- **Easy to extend** — adding a new switch is a one-line change in the app config

## Hardware

Two ESP8266 boards, each running its own firmware:

| Board          | Node ID    | Relays / IO                                                                 |
|-----------------|-------------|--------------------------------------------------------------------------------|
| **TV Board**    | `tvboard`   | Relay 1 → AC (Sleep Mode support) · Relay 2 → TV · Relay 3 → Socket 1 · Relay 4 → Socket 2 |
| **Fan Board**   | `fanboard`  | Relay 1 → Bulb 1 · Relay 2 → Bulb 2 · Relay 3 → Fan · Relay 4 → Socket · IR transceiver → AC + TV remote |

Firmware (`.ino`) for both boards lives in the `firmware/` folder next to the app folder. Wiring diagram, library list, and flashing steps are in `firmware/README.txt`.

## App Flow

1. **Splash Screen** — the gold "PATEL" logo fades in/out in a loop while the app connects to the MQTT broker and both ESP boards. Once everything's online, it opens automatically. If a board is unreachable, a "Continue anyway" link appears after ~6 seconds, and the app opens on its own after ~25 seconds either way — so it never gets stuck on the splash screen.

2. **Dashboard** — the home tab. Shows a card for each connected ESP board (online/offline dot + number of switches on it). Tap a card to open all switches on that board.

3. **Per-appliance controls** — tap the gear icon next to any switch to open its settings sheet:
   - Auto-off timer (15m / 30m / 1h / 2h)
   - Daily schedule (HH:MM, using the board's NTP time)
   - Sleep Mode (AC only)

4. **Remote tab** — full AC + TV remote via the Fan Board's IR transceiver. Long-press any button to enter Learn Mode (15-second window) and teach it a button from your real remote.

5. **Appliances tab** — every switch in the house, grouped by board, with the same gear-icon controls as the dashboard.

6. **Settings tab** — set your own MQTT broker URL, username, password, and topic prefix. Saved on the phone and reconnects instantly.

7. **WiFi settings** (per board, from its detail page) — add/edit multiple WiFi networks for that board. If a board isn't connected to any saved network (e.g. brand new board), it opens its own `SmartHome-Setup-XXXX` hotspot so you can configure WiFi directly from your phone, no reflashing required.

## Getting Started (App)

```bash
npm install
```

1. Install **Expo Go** on your phone (free, Play Store)
2. Run the dev server:
   ```bash
   npx expo start
   ```
3. Scan the QR code with Expo Go — the app opens instantly

### Building a real APK

Follow the steps in `APK_BUILD_GUIDE`:
```bash
eas login
eas build -p android --profile preview
```

## MQTT Setup

- **Default broker:** `broker.hivemq.com` (public test broker)
- **Default topic prefix:** `smarthome`

You can point the app to your own broker from the **Settings** tab — just make sure both ESP boards' `config.h` use the exact same broker and prefix.

### Topic Contract

| Topic                                              | Direction   | Payload                              |
|------------------------------------------------------|--------------|-----------------------------------------|
| `<prefix>/<node>/<ch>/set`                          | app → ESP   | `"1"` / `"0"`                          |
| `<prefix>/<node>/<ch>/state`                        | ESP → app   | `"1"` / `"0"` (retained)               |
| `<prefix>/<node>/<ch>/timer/set`                    | app → ESP   | seconds (`"0"` = cancel)               |
| `<prefix>/<node>/<ch>/timer/state`                  | ESP → app   | seconds left (retained)                |
| `<prefix>/<node>/<ch>/schedule/set`                 | app → ESP   | `"HH:MM"` (`""` = cancel)              |
| `<prefix>/<node>/<ch>/schedule/state`               | ESP → app   | `"HH:MM"` (retained)                   |
| `<prefix>/tvboard/relay1/sleep/set`                 | app → ESP   | `"1"` / `"0"` (AC only)                |
| `<prefix>/tvboard/relay1/sleep/state`               | ESP → app   | `"1"` / `"0"` (retained)               |
| `<prefix>/<node>/status`                            | ESP → app   | JSON, e.g. `{"online": true, "ip": "192.168.1.42"}` (retained) |
| `<prefix>/fanboard/ir/send`                         | app → ESP   | JSON `{device, button}`                |
| `<prefix>/fanboard/ir/learn/req`                    | app → ESP   | JSON `{device, button}`                |
| `<prefix>/fanboard/ir/learn/ack`                    | ESP → app   | JSON `{ok, ...}`                       |
| `<prefix>/<node>/wifi/list/set`                     | app → ESP   | JSON `[{ssid, password}, ...]` (replaces saved list) |
| `<prefix>/<node>/wifi/list/state`                   | ESP → app   | JSON `{networks: [ssid, ...], connected: "ssid"}` (retained) |

## Adding a New Switch

Add one line to the `SH_APPLIANCES` array in `src/config.js` — the Dashboard, Appliances tab, and each board's detail page update automatically, no other changes needed.

## Project Structure (App)

```
src/
├── screens/
│   └── SplashScreen.js        # logo animation + connection wait logic
├── components/
│   └── ApplianceControlSheet.js  # timer / schedule / sleep mode bottom sheet
├── config.js                   # SH_APPLIANCES — add new switches here
└── assets/
    └── logo.png
firmware/
├── tvboard.ino
├── fanboard.ino
└── README.txt                  # wiring, libraries, flashing steps
```

## Tech Stack

- React Native (Expo)
- MQTT (HiveMQ public broker by default)
- ESP8266 (firmware in C++/Arduino)
- IR transceiver for AC/TV remote control