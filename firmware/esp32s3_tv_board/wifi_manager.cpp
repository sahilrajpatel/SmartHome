// wifi_manager.cpp — see wifi_manager.h for the full explanation.
// Portable: same file works on ESP8266 AND ESP32 / ESP32-S3.
#include "wifi_manager.h"
#include "config.h"
#include <LittleFS.h>
#include <DNSServer.h>
#include <ArduinoJson.h>

#if defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266WebServer.h>
  typedef ESP8266WebServer WmWebServer;
#else
  #include <WiFi.h>
  #include <WebServer.h>
  typedef WebServer WmWebServer;
#endif

static const char *WM_FILE = "/wifinets.json";

static WmNetwork g_nets[WM_MAX_NETWORKS];
static int g_count = 0;

static bool g_portalActive = false;
static DNSServer *g_dns = nullptr;
static WmWebServer *g_web = nullptr;
static unsigned long g_lastAttemptMs = 0;
static const unsigned long WM_RETRY_GAP_MS = 15000; // background retry gap jab disconnected ho

// -------------------------------------------------------------------------
// Small helper: unique-ish suffix for the setup hotspot name, works
// identically on ESP8266 and ESP32 (unlike ESP.getChipId(), jo sirf
// ESP8266 pe hota hai).
// -------------------------------------------------------------------------
static String wmApSuffix() {
  String mac = WiFi.macAddress(); // "AA:BB:CC:DD:EE:FF"
  mac.replace(":", "");
  return mac.substring(mac.length() - 6);
}

// -------------------------------------------------------------------------
// Flash persistence
// -------------------------------------------------------------------------
static void wmLoadFromFlash() {
  g_count = 0;
  if (!LittleFS.begin()) {
    Serial.println("[wifi] LittleFS mount FAILED");
    return;
  }
  File f = LittleFS.open(WM_FILE, "r");
  if (!f) {
    Serial.println("[wifi] no saved networks file yet");
    return;
  }
  DynamicJsonDocument doc(1024);
  DeserializationError err = deserializeJson(doc, f);
  f.close();
  if (err) {
    Serial.println("[wifi] saved networks file unreadable, ignoring");
    return;
  }
  JsonArray arr = doc.as<JsonArray>();
  for (JsonVariant v : arr) {
    if (g_count >= WM_MAX_NETWORKS) break;
    const char *s = v["s"] | "";
    const char *p = v["p"] | "";
    if (strlen(s) == 0) continue;
    strncpy(g_nets[g_count].ssid, s, WM_SSID_LEN - 1);
    g_nets[g_count].ssid[WM_SSID_LEN - 1] = 0;
    strncpy(g_nets[g_count].pass, p, WM_PASS_LEN - 1);
    g_nets[g_count].pass[WM_PASS_LEN - 1] = 0;
    g_count++;
  }
  Serial.printf("[wifi] loaded %d saved network(s) from flash\n", g_count);
}

static void wmSaveToFlash() {
  DynamicJsonDocument doc(1024);
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < g_count; i++) {
    JsonObject o = arr.createNestedObject();
    o["s"] = g_nets[i].ssid;
    o["p"] = g_nets[i].pass;
  }
  File f = LittleFS.open(WM_FILE, "w");
  if (!f) {
    Serial.println("[wifi] could not open networks file for writing");
    return;
  }
  serializeJson(doc, f);
  f.close();
  Serial.printf("[wifi] saved %d network(s) to flash\n", g_count);
}

static void wmSeedFromFactoryDefault() {
  // Sirf tab chalta hai jab flash me KUCH bhi saved nahi hai (bilkul
  // pehli baar flash hua board). Uske baad WIFI_SSID/WIFI_PASSWORD
  // (config.h) kabhi dobara nahi padhe jaate — sab kuch app/portal se.
#if defined(WIFI_SSID) && defined(WIFI_PASSWORD)
  if (strlen(WIFI_SSID) > 0) {
    strncpy(g_nets[0].ssid, WIFI_SSID, WM_SSID_LEN - 1);
    g_nets[0].ssid[WM_SSID_LEN - 1] = 0;
    strncpy(g_nets[0].pass, WIFI_PASSWORD, WM_PASS_LEN - 1);
    g_nets[0].pass[WM_PASS_LEN - 1] = 0;
    g_count = 1;
    wmSaveToFlash();
    Serial.println("[wifi] seeded saved-network list from config.h factory default");
  }
#endif
}

// -------------------------------------------------------------------------
// Public: save / read
// -------------------------------------------------------------------------
void wmSaveNetworks(WmNetwork *nets, int count) {
  g_count = count > WM_MAX_NETWORKS ? WM_MAX_NETWORKS : count;
  for (int i = 0; i < g_count; i++) {
    g_nets[i] = nets[i];
  }
  wmSaveToFlash();
}

int wmGetNetworks(WmNetwork *outNets, int maxCount) {
  int n = g_count > maxCount ? maxCount : g_count;
  for (int i = 0; i < n; i++) outNets[i] = g_nets[i];
  return n;
}

String wmStatusJson() {
  DynamicJsonDocument doc(512);
  JsonArray arr = doc.createNestedArray("networks");
  for (int i = 0; i < g_count; i++) arr.add(g_nets[i].ssid);
  doc["connected"] = (WiFi.status() == WL_CONNECTED) ? WiFi.SSID() : String("");
  String out;
  serializeJson(doc, out);
  return out;
}

// -------------------------------------------------------------------------
// Connecting to saved networks (blocking scan, called sparingly)
// -------------------------------------------------------------------------
static bool wmTryConnectAll(unsigned long perNetworkTimeoutMs) {
  if (g_count == 0) return false;
  WiFi.mode(WIFI_STA);
  for (int i = 0; i < g_count; i++) {
    Serial.printf("[wifi] trying \"%s\"...\n", g_nets[i].ssid);
    WiFi.begin(g_nets[i].ssid, g_nets[i].pass);
    unsigned long start = millis();
    while (WiFi.status() != WL_CONNECTED && millis() - start < perNetworkTimeoutMs) {
      delay(250);
    }
    if (WiFi.status() == WL_CONNECTED) {
      Serial.printf("[wifi] connected to \"%s\", IP: %s\n", g_nets[i].ssid, WiFi.localIP().toString().c_str());
      return true;
    }
    WiFi.disconnect(true);
    delay(100);
  }
  return false;
}

// -------------------------------------------------------------------------
// Setup hotspot / captive portal — koi bhi phone/laptop isse connect karke
// naya WiFi add kar sakta hai, app ki zaroorat nahi.
// -------------------------------------------------------------------------
static String wmPortalHtml(const String &msg) {
  String html = F(
    "<!DOCTYPE html><html><head><meta name='viewport' content='width=device-width,initial-scale=1'>"
    "<title>SmartHome WiFi Setup</title><style>"
    "body{font-family:sans-serif;background:#12151c;color:#eee;padding:20px;max-width:420px;margin:auto}"
    "h2{color:#f4c542}input{width:100%;padding:10px;margin:6px 0 14px;border-radius:8px;border:1px solid #444;"
    "background:#1c2029;color:#eee;box-sizing:border-box}"
    "button{width:100%;padding:12px;border-radius:8px;border:none;background:#f4c542;color:#111;font-weight:bold;font-size:15px}"
    ".msg{background:#233;padding:10px;border-radius:8px;margin-bottom:14px;font-size:13px}"
    "</style></head><body>"
    "<h2>SmartHome WiFi Setup</h2>"
  );
  if (msg.length()) {
    html += "<div class='msg'>" + msg + "</div>";
  }
  html += F(
    "<p style='font-size:13px;color:#9aa'>Yahan apna ghar ka WiFi naam/password daalo. Board save karke reboot "
    "ho jayega aur usi network se judne ki koshish karega. Baad me app se bhi networks add/change kar sakte ho.</p>"
    "<form method='POST' action='/save'>"
    "<label>WiFi Name (SSID)</label><input name='ssid' maxlength='32' required>"
    "<label>Password</label><input name='pass' type='password' maxlength='64'>"
    "<button type='submit'>Save &amp; Connect</button>"
    "</form></body></html>"
  );
  return html;
}

static void wmHandleRoot() {
  g_web->send(200, "text/html", wmPortalHtml(""));
}

static void wmHandleSave() {
  String ssid = g_web->arg("ssid");
  String pass = g_web->arg("pass");
  ssid.trim();
  if (ssid.length() == 0) {
    g_web->send(200, "text/html", wmPortalHtml("SSID khali nahi ho sakta, dobara try karo."));
    return;
  }

  // Naye network ko APPEND karo (purani list delete nahi hoti) — agar
  // list already full hai to sabse purana entry hata do.
  if (g_count >= WM_MAX_NETWORKS) {
    for (int i = 1; i < g_count; i++) g_nets[i - 1] = g_nets[i];
    g_count = WM_MAX_NETWORKS - 1;
  }
  strncpy(g_nets[g_count].ssid, ssid.c_str(), WM_SSID_LEN - 1);
  g_nets[g_count].ssid[WM_SSID_LEN - 1] = 0;
  strncpy(g_nets[g_count].pass, pass.c_str(), WM_PASS_LEN - 1);
  g_nets[g_count].pass[WM_PASS_LEN - 1] = 0;
  g_count++;
  wmSaveToFlash();

  g_web->send(200, "text/html",
    wmPortalHtml("Saved! Board 3 second me reboot hoke \"" + ssid + "\" se judne ki koshish karega."));
  delay(2500);
  ESP.restart();
}

static void wmStartPortal() {
  g_portalActive = true;

  String apName = "SmartHome-Setup-" + wmApSuffix();
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str()); // open network, koi password nahi — sirf local setup ke liye

  if (!g_dns) g_dns = new DNSServer();
  g_dns->start(53, "*", WiFi.softAPIP()); // saare domains 192.168.4.1 pe redirect (captive portal)

  if (!g_web) g_web = new WmWebServer(80);
  g_web->on("/", wmHandleRoot);
  g_web->on("/save", HTTP_POST, wmHandleSave);
  g_web->onNotFound(wmHandleRoot); // captive portal detection pages bhi setup page hi dekhein
  g_web->begin();

  Serial.println("=========================================================");
  Serial.print("[wifi] no saved network reachable — setup hotspot active: ");
  Serial.println(apName);
  Serial.println("[wifi] phone/laptop se isse connect karo, phir browser me 192.168.4.1 kholo");
  Serial.println("=========================================================");
}

// -------------------------------------------------------------------------
// Public: begin / loop
// -------------------------------------------------------------------------
void wmBegin() {
  wmLoadFromFlash();
  if (g_count == 0) wmSeedFromFactoryDefault();

  // Setup hotspot ab SIRF tab khulta hai jab flash me koi bhi saved
  // network na ho (bilkul pehli baar / list poori khaali). Agar list me
  // kuch bhi saved hai, hotspot kabhi khud nahi khulta — board un
  // networks ko hi hamesha retry karta rehta hai (wmLoop() background
  // me), router wapas aane ka intezaar karte hue.
  if (g_count == 0) {
    wmStartPortal();
  } else {
    wmTryConnectAll(6000); // best-effort abhi; na bhi jude to wmLoop() retry karta rahega
  }
  g_lastAttemptMs = millis();
}

bool wmPortalActive() { return g_portalActive; }

bool wmLoop() {
  if (g_portalActive) {
    g_dns->processNextRequest();
    g_web->handleClient();
    // Portal sirf zero-saved-networks case me khulta hai, jahan retry
    // karne ke liye kuch hai hi nahi — isliye ab koi auto-timeout nahi,
    // bas user ke setup form submit karne ka intezaar karta hai.
    return false;
  }

  if (WiFi.status() == WL_CONNECTED) return true;

  unsigned long now = millis();
  if (now - g_lastAttemptMs > WM_RETRY_GAP_MS) {
    g_lastAttemptMs = now;
    if (g_count == 0) {
      wmStartPortal();
    } else {
      // Saved list ke saare networks phir se try karo — jab tak router
      // wapas nahi aata board yahi loop chalata rahega, hotspot nahi
      // khulega.
      wmTryConnectAll(5000);
    }
  }
  return WiFi.status() == WL_CONNECTED;
}
