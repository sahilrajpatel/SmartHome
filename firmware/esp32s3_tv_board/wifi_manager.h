// =========================================================================
//  wifi_manager.h — multi-network WiFi storage + setup hotspot
//  (works on ESP8266 AND ESP32 / ESP32-S3 — same file, same API)
// =========================================================================
//  Ab WiFi_SSID/WIFI_PASSWORD sirf FIRST-EVER-BOOT ke liye "factory
//  default" hain (config.h me). Uske baad se saari WiFi networks flash
//  (LittleFS) me save rehti hain, aur inhe manage karne ke DO tareeke
//  hain — dono kabhi bhi, jitni baar chaho, use kar sakte ho:
//
//   1) APP SE (jab board already kisi WiFi se online hai):
//      App ke WiFi screen se ek ya ek se zyada network (SSID+password)
//      ek saath bhej do — board unhe flash me save kar lega aur agli
//      baar disconnect/reconnect hote hi (ya turant, agar current wala
//      already list me nahi hai) unme se jo bhi available ho usse jud
//      jayega. Password badla? Bas wahi naya password app se firse bhej
//      do — CODE ya config.h dobara CHANGE/UPLOAD karne ki zaroorat
//      nahi.
//
//   2) SETUP HOTSPOT SE (jab board KISI bhi saved network se connect
//      nahi ho paa raha — jaise sabse pehli baar, ya sab saved networks
//      ek saath badal/band ho gaye): board khud apna "SmartHome-Setup-
//      XXXX" WiFi hotspot chalu kar deta hai. Kisi bhi phone/laptop se
//      usse connect karo, ek setup page apne aap khul jaata hai (ya
//      browser me 192.168.4.1 kholo) — wahan se naya SSID/password daal
//      do, board save karke reboot ho jayega aur naye network se judne
//      ki koshish karega.
//
//  IMPORTANT — jab tak flash me EK BHI saved network hai, hotspot KABHI
//  khud nahi khulta, chahe WiFi kitni bhi der down rahe. Board bas
//  background me saved list ko baar-baar retry karta rehta hai jab tak
//  router wapas na aaye. Hotspot sirf us EK situation me khulta hai jab
//  saved list bilkul KHAALI ho (fresh/blank flash, ya sab networks
//  manually delete kar diye ho).
//
//  Dono tareeke same flash storage use karte hain, isliye ek doosre ko
//  overwrite nahi karte — jo bhi list me hai, board un sab ko try karta
//  rehta hai jab tak koi ek available na ho.
// =========================================================================
#pragma once
#include <Arduino.h>

#define WM_MAX_NETWORKS 6
#define WM_SSID_LEN 33   // 32 chars + null
#define WM_PASS_LEN 65   // 64 chars + null

struct WmNetwork {
  char ssid[WM_SSID_LEN];
  char pass[WM_PASS_LEN];
};

// setup() se ek baar call karo (Serial.begin() ke baad). Flash se saved
// networks load karta hai (khali hone par config.h ke factory-default
// WIFI_SSID/WIFI_PASSWORD se list seed kar deta hai), phir unhe try karta
// hai. Agar koi bhi connect na ho, to bhi hotspot NAHI khulta jab tak
// list khali na ho (uss case me wmLoop() background me retry karta
// rehta hai — dekho neeche).
void wmBegin();

// Har loop() iteration me call karo. Setup portal chalu ho to usko
// service karta hai (DNS + web server), warna background me saved
// networks retry karta rehta hai. Return: abhi STA WiFi connected hai ya
// nahi.
bool wmLoop();

// True jab tak setup hotspot/portal chalu hai (abhi tak kisi saved
// network se connect nahi ho paaya — aur list bhi khaali hai).
bool wmPortalActive();

// Poori saved-network list ko `nets` (count entries) se REPLACE karta hai
// aur turant flash me save kar deta hai. Current live connection ko chhu
// nahi jata (agar wahi network naye list me bhi hai to judaa rahega) —
// naya list agle reconnect attempt se use hoga.
void wmSaveNetworks(WmNetwork *nets, int count);

// Abhi flash me saved list (password sahit) `outNets` me copy karta hai.
// Return: kitni entries mili. INTERNAL use ke liye — MQTT pe kabhi mat
// bhejna (passwords hote hain), uske liye wmStatusJson() use karo.
int wmGetNetworks(WmNetwork *outNets, int maxCount);

// {"networks":["ssid1","ssid2"],"connected":"jis_se_abhi_juda_hai"} —
// ye hi MQTT pe publish karne layak safe JSON hai (password kabhi nahi
// hota isme).
String wmStatusJson();
