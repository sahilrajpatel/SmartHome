// config.h — ESP32-S3 "TV Board" (REAL relays — AC + TV, abhi ke liye)
// Sirf isi file me apni WiFi/broker details bharni hain. Baaki .ino file
// ko haath lagane ki zaroorat nahi.
#pragma once

// ------------------------- WiFi -------------------------
// Ye SIRF pehli baar (blank flash) ke liye seed value hai. Ek baar board
// chal jaye to app ki WiFi Settings screen se jitne network daalo, wahi
// flash me save ho jaate hain aur ye 2 lines fir kabhi matter nahi
// karti — password badle to yahan nahi, app se hi update karo.
#define WIFI_SSID     "patel"
#define WIFI_PASSWORD ""   // open network, koi password nahi

// ------------------------- MQTT --------------------------
// App ke Settings tab me jo broker daala hai, WAHI yahan bhi daalo.
//
// Pre-filled with your HiveMQ Cloud instance (TLS, port 8883) — same
// cluster as the app's default. HiveMQ Cloud ALWAYS needs a username +
// password: HiveMQ Cloud -> Access Management -> create credentials ->
// paste them below AND in the app's Settings tab.
//
// Cloud broker hai (local WiFi router nahi) — isliye jab tak dono taraf
// (ye ESP32-S3, aur jis phone me app hai) internet se connected hain,
// app GHAR ke WiFi ke bahar se bhi — mobile data pe, kahin bhi se —
// switches control kar sakti hai. "Kahi se bhi operate" wala requirement
// isi HiveMQ Cloud setup se hi poora hota hai, ESP32-S3 khud WiFi router
// se hi judega (mobile hotspot ya SIM module nahi chahiye).
#define MQTT_USE_TLS  true
#define MQTT_HOST     "f64151b14e2547328789efc34e44af21.s1.eu.hivemq.cloud"
#define MQTT_PORT     8883
#define MQTT_USER     "sahil"
#define MQTT_PASSWORD "u3lm4ew82k"

// App ke Settings tab me "TOPIC PREFIX" field me bhi yahi value daalo.
#define TOPIC_PREFIX  "smarthome"

// Is board ka node id — app ke src/config.js ke SH_NODES me "tvboard" se
// match karta hai (isiliye app ka AC/TV switch bina koi app-code badle
// seedha isi board se baat karega). Mat badlo.
#define NODE_ID       "tvboard"

// ---------------------- GPIO PINOUT (ESP32-S3) -----------------------
// ESP32-S3 DevKitC/DevKitM jaisi boards ke liye general-purpose, safe
// pins (boot-strapping pins GPIO0/3/45/46 aur native-USB pins GPIO19/20
// jaan-bujh kar avoid kiye gaye hain).
//
// ABHI sirf 2 relay hain — AC aur TV. Kal ko Socket 1 / Socket 2 add
// karne hain to bas RELAY_COUNT ko 4 karo, do aur pins (jaise GPIO6,
// GPIO7) yahan add karo, aur app ke src/config.js me pehle se maujood
// commented-out socket lines uncomment kar dena — kuch aur badalna nahi
// padega.
#define RELAY1_PIN    7    // GPIO4 -> AC relay IN
#define RELAY2_PIN    5    // GPIO5 -> TV relay IN
#define RELAY3_PIN    6    // GPIO6 -> Socket 1 relay IN
#define RELAY4_PIN    4    // GPIO7 -> Socket 2 relay IN

// Zyaadatar relay modules "active LOW" hote hain (LOW signal = relay ON).
// Agar tumhara module active HIGH hai (relay ON hi na ho / hamesha ON
// rahe) to isko false kar do.
#define RELAY_ACTIVE_LOW true

// Relay 1 (AC) hi Sleep Mode support karta hai (15 min ON / 15 min OFF
// cycle). Mat badlo.
#define SLEEP_CAPABLE_RELAY 1

// ---------------------- TIME / SCHEDULE -----------------------
// Daily auto-off schedule ke liye ESP NTP se time leta hai. India ke
// liye offset already IST (+5:30) set hai.
#define NTP_TZ_OFFSET_SEC 19800
#define NTP_SERVER_1 "pool.ntp.org"
#define NTP_SERVER_2 "time.google.com"

// Board ka onboard LED status indicator ke liye (blink = WiFi/MQTT
// retry, solid ON = fully connected). Zyaadatar ESP32-S3 DevKitC boards
// par onboard LED GPIO48 hota hai — apne board ki silkscreen check kar
// lena. Agar onboard LED hi nahi hai to bhi chalega (harmless).
#define STATUS_LED_PIN 48
#define STATUS_LED_ACTIVE_LOW false   // ESP8266 wale board se ulta — S3 ka onboard LED usually active HIGH hota hai
