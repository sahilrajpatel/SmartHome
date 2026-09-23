// config.h — ESP1 "TV Board"
// Sirf isi file me apni WiFi/broker details bharni hain. Baaki .ino file
// ko haath lagane ki zaroorat nahi.
#pragma once

// ------------------------- WiFi -------------------------
// Ye sirf BILKUL PEHLI BAAR flash karne ke liye "factory default" hai —
// board pehli baar boot hote hi isse apni saved-network list (flash/
// LittleFS) me copy kar leta hai, aur uske baad kabhi is file ko wapas
// nahi padhta. Router ka password baad me badal jaye to isse edit karke
// dobara upload karne ki ZAROORAT NAHI — WiFi Settings (app ke WiFi icon
// se) me jaake naya password bhej do, ya board offline ho jaaye to uska
// apna "SmartHome-Setup-XXXX" hotspot khud khul jaata hai jisse kisi bhi
// phone/laptop se naya WiFi daal sakte ho (dekho firmware/README.txt).
//
// Agar bilkul pehli baar me hi apna asli WiFi pata hai to yahan bhar do
// (convenient), warna khali bhi chhod sakte ho ("") — tab board seedha
// setup hotspot khol dega pehle hi boot pe.
#define WIFI_SSID     "patel"
#define WIFI_PASSWORD ""

// ------------------------- MQTT --------------------------
// App ke Settings tab me jo broker daala hai, WAHI yahan bhi daalo
// (hostname yahan, aur poora "wss://host:8884/mqtt" waha app me).
//
// Pre-filled with your HiveMQ Cloud instance (TLS, port 8883) — same
// cluster as the app's default. HiveMQ Cloud ALWAYS needs a username +
// password: go to HiveMQ Cloud -> Access Management -> create
// credentials -> paste them below AND in the app's Settings tab.
//
// MQTT_USE_TLS true  -> secure connection (WiFiClientSecure), port 8883.
//                       Required for HiveMQ Cloud / EMQX Cloud etc.
// MQTT_USE_TLS false -> plain unencrypted connection (WiFiClient), for
//                       a local Mosquitto broker or the public test
//                       broker.hivemq.com:1883 while testing.
#define MQTT_USE_TLS  true
#define MQTT_HOST     "f4a2080940a6437ebf6500cb6f9b15e1.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_USER     "sahil"              // required for HiveMQ Cloud — fill this in
#define MQTT_PASSWORD "u3lm4ew82k"              // required for HiveMQ Cloud — fill this in

// App ke Settings tab me "TOPIC PREFIX" field me bhi yahi value daalo.
#define TOPIC_PREFIX  "smarthome"

// Is board ka node id — src/config.js ke SH_NODES me "tvboard" se match
// karta hai. Mat badlo jab tak app config me bhi na badlo.
#define NODE_ID       "tvboard"

// ---------------------- GPIO PINOUT -----------------------
// NodeMCU / Wemos D1 mini (ESP8266) label ke hisaab se pin diye hain.
// GPIO0 / GPIO2 / GPIO15 (D3/D4/D8) boot-mode pins hain, isliye unhe
// avoid kiya hai taaki bootup me dikkat na ho.
#define RELAY1_PIN    5    // D1 -> AC relay IN
#define RELAY2_PIN    4    // D2 -> TV relay IN
#define RELAY3_PIN    12   // D6 -> Socket 1 relay IN
#define RELAY4_PIN    13   // D7 -> Socket 2 relay IN

// Zyaadatar relay modules "active LOW" hote hain (LOW signal = relay ON).
// Agar tumhara module active HIGH hai (relay ON hi na ho / hamesha ON
// rahe) to isko false kar do.
#define RELAY_ACTIVE_LOW true

// Relay 1 (AC) hi Sleep Mode support karta hai (15 min ON / 15 min OFF
// cycle). Doosre relays ke liye ye feature nahi hai — mat badlo.
#define SLEEP_CAPABLE_RELAY 1

// ---------------------- TIME / SCHEDULE -----------------------
// Daily auto-off schedule ke liye ESP NTP se time leta hai. India ke
// liye offset already IST (+5:30) set hai — dusre timezone me ho to
// seconds badal do (e.g. UTC+5:30 = 5*3600+30*60 = 19800).
#define NTP_TZ_OFFSET_SEC 19800
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"

// Board ka onboard LED status indicator ke liye (blink = WiFi/MQTT retry).
#define STATUS_LED_PIN LED_BUILTIN
