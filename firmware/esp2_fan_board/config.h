// config.h — ESP2 "Fan Board"
// Sirf isi file me apni WiFi/broker details bharni hain.
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
// Pre-filled with your HiveMQ Cloud instance (TLS, port 8883) — same
// cluster as the app's default. HiveMQ Cloud ALWAYS needs a username +
// password: go to HiveMQ Cloud -> Access Management -> create
// credentials -> paste them below AND in the app's Settings tab.
//
// MQTT_USE_TLS true  -> secure connection (WiFiClientSecure), port 8883.
// MQTT_USE_TLS false -> plain unencrypted connection, for local testing.
#define MQTT_USE_TLS  true
#define MQTT_HOST     "f4a2080940a6437ebf6500cb6f9b15e1.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_USER     "sahil"              // required for HiveMQ Cloud — fill this in
#define MQTT_PASSWORD "u3lm4ew82k"              // required for HiveMQ Cloud — fill this in

// App ke Settings tab me "TOPIC PREFIX" field me bhi yahi value daalo.
#define TOPIC_PREFIX  "smarthome"

// Is board ka node id — src/config.js ke SH_NODES me "fanboard" se
// match karta hai. Mat badlo jab tak app config me bhi na badlo.
#define NODE_ID       "fanboard"

// ---------------------- GPIO PINOUT -----------------------
// NodeMCU / Wemos D1 mini (ESP8266) label ke hisaab se pin diye hain.
// GPIO0/GPIO2/GPIO15 (D3/D4/D8) boot-mode pins hain aur GPIO1/GPIO3
// (D10/D9) Serial TX/RX hain — sab avoid kiye hain taaki bootup ya
// Serial Monitor me dikkat na ho.
#define RELAY1_PIN    5    // D1 -> Bulb 1 relay IN
#define RELAY2_PIN    4    // D2 -> Bulb 2 relay IN
#define RELAY3_PIN    16   // D0 -> Fan relay IN
#define RELAY4_PIN    13   // D7 -> Socket relay IN

// Zyaadatar relay modules "active LOW" hote hain (LOW signal = relay ON).
#define RELAY_ACTIVE_LOW true

// ---------------------- TIME / SCHEDULE -----------------------
#define NTP_TZ_OFFSET_SEC 19800   // IST (+5:30)
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"

#define STATUS_LED_PIN LED_BUILTIN
