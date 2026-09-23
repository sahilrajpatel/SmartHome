// =========================================================================
//  wifi_multi.h — Shared multi-network WiFi manager for all ESP boards.
//  (Copy this SAME file into every firmware/espX_.../ folder — Arduino
//  needs it sitting next to the .ino it's used from.)
//
//  WHAT IT DOES
//  ------------
//  1. Stores a LIST of WiFi networks (SSID + password) in flash
//     (LittleFS) instead of a single hardcoded one. Uses WiFiMulti to
//     auto-connect to WHICHEVER of them is currently in range — and
//     switches over on its own if the connected one drops and another
//     becomes available.
//  2. The app can update this list any time over MQTT — topic
//        <prefix>/<node>/wifi/set     (app -> ESP, JSON array)
//        <prefix>/<node>/wifi/state   (ESP -> app, retained JSON)
//     Payload for /set:  [{"ssid":"Home","password":"pass1"},
//                          {"ssid":"Hotspot","password":"pass2"}]
//     This ONLY works while the board is still connected to MQTT through
//     at least one network already in the list — that's how you add a
//     backup network, or fix a password for a network the board isn't
//     currently depending on, without ever opening Arduino IDE again.
//  3. IMPORTANT LIMITATION (physics, not a bug): if the board loses
//     connection to EVERY saved network at once (e.g. you changed the
//     only router's password and never added a backup), it can't
//     receive MQTT anymore — nothing can reach it over WiFi. For that
//     case it falls back to its OWN hotspot ("<NODE_ID>-setup", open,
//     no password). Connect a phone to that hotspot, a setup page opens
//     (or go to 192.168.4.1 in a browser), enter the new WiFi + save.
//     Board reboots and tries again. No re-flashing ever needed.
// =========================================================================
#pragma once
#include <ArduinoJson.h>
#include <LittleFS.h>
#include <DNSServer.h>

#if defined(ESP8266)
  #include <ESP8266WiFi.h>
  #include <ESP8266WiFiMulti.h>
  #include <ESP8266WebServer.h>
  ESP8266WiFiMulti wifiMulti;
  ESP8266WebServer wifiPortalServer(80);
#else
  #include <WiFi.h>
  #include <WiFiMulti.h>
  #include <WebServer.h>
  WiFiMulti wifiMulti;
  WebServer wifiPortalServer(80);
#endif

#define MAX_WIFI_NETWORKS 5
struct WifiNet { String ssid; String password; };
WifiNet wifiNets[MAX_WIFI_NETWORKS];
int wifiNetCount = 0;

DNSServer wifiDnsServer;
bool wifiPortalActive = false;
unsigned long wifiPortalStartMs = 0;

// ---- Topic helpers (uses NODE_ID / TOPIC_PREFIX from config.h) ----
String topicWifiSet()   { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/wifi/set"; }
String topicWifiState() { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/wifi/state"; }

// ---- Load / save network list on flash ----
void wifiSaveNetworks() {
  StaticJsonDocument<1024> doc;
  JsonArray arr = doc.to<JsonArray>();
  for (int i = 0; i < wifiNetCount; i++) {
    JsonObject o = arr.createNestedObject();
    o["ssid"] = wifiNets[i].ssid;
    o["password"] = wifiNets[i].password;
  }
  File f = LittleFS.open("/wifi_nets.json", "w");
  if (f) { serializeJson(doc, f); f.close(); }
}

void wifiLoadNetworks() {
  wifiNetCount = 0;
  if (LittleFS.exists("/wifi_nets.json")) {
    File f = LittleFS.open("/wifi_nets.json", "r");
    if (f) {
      StaticJsonDocument<1024> doc;
      DeserializationError err = deserializeJson(doc, f);
      f.close();
      if (!err && doc.is<JsonArray>()) {
        for (JsonObject o : doc.as<JsonArray>()) {
          if (wifiNetCount >= MAX_WIFI_NETWORKS) break;
          const char* ssid = o["ssid"] | "";
          if (strlen(ssid) == 0) continue;
          wifiNets[wifiNetCount].ssid = ssid;
          wifiNets[wifiNetCount].password = (const char*)(o["password"] | "");
          wifiNetCount++;
        }
      }
    }
  }
  // First-ever boot (nothing saved yet): seed from config.h so existing
  // setups keep working with zero app interaction required.
  if (wifiNetCount == 0 && strlen(WIFI_SSID) > 0 && strcmp(WIFI_SSID, "YOUR_WIFI_SSID") != 0) {
    wifiNets[0].ssid = WIFI_SSID;
    wifiNets[0].password = WIFI_PASSWORD;
    wifiNetCount = 1;
    wifiSaveNetworks();
  }
}

void wifiApplyToMulti() {
#if defined(ESP8266)
  wifiMulti.APlistClean();
#endif
  for (int i = 0; i < wifiNetCount; i++) {
    wifiMulti.addAP(wifiNets[i].ssid.c_str(), wifiNets[i].password.c_str());
  }
}

// ---- Fallback setup hotspot (captive-portal-ish) ----
String wifiPortalHtml() {
  String html = "<html><body style='font-family:sans-serif;padding:16px'>";
  html += "<h3>" + String(NODE_ID) + " \xe2\x80\x94 WiFi Setup</h3>";
  html += "<p>Board could not connect to any saved network. Enter a working one:</p>";
  html += "<form method='POST' action='/save'>";
  html += "WiFi Name (SSID):<br><input name='ssid' style='width:100%;padding:8px'><br><br>";
  html += "Password:<br><input name='password' type='password' style='width:100%;padding:8px'><br><br>";
  html += "<input type='submit' value='Save &amp; Reboot' style='padding:10px 20px'>";
  html += "</form></body></html>";
  return html;
}

void wifiPortalHandleSave() {
  String ssid = wifiPortalServer.arg("ssid");
  String pass = wifiPortalServer.arg("password");
  if (ssid.length() > 0) {
    if (wifiNetCount >= MAX_WIFI_NETWORKS) {
      for (int i = 1; i < wifiNetCount; i++) wifiNets[i - 1] = wifiNets[i];
      wifiNetCount = MAX_WIFI_NETWORKS - 1;
    }
    wifiNets[wifiNetCount].ssid = ssid;
    wifiNets[wifiNetCount].password = pass;
    wifiNetCount++;
    wifiSaveNetworks();
    wifiPortalServer.send(200, "text/html", "<html><body style='font-family:sans-serif;padding:16px'>Saved. Rebooting and connecting now...</body></html>");
    delay(1500);
    ESP.restart();
  } else {
    wifiPortalServer.send(200, "text/html", wifiPortalHtml());
  }
}

void wifiStartPortal() {
  wifiPortalActive = true;
  wifiPortalStartMs = millis();
  String apName = String(NODE_ID) + "-setup";
  WiFi.mode(WIFI_AP);
  WiFi.softAP(apName.c_str()); // open network, no password, easy to join
  wifiDnsServer.start(53, "*", WiFi.softAPIP());
  wifiPortalServer.onNotFound([]() { wifiPortalServer.send(200, "text/html", wifiPortalHtml()); });
  wifiPortalServer.on("/save", HTTP_POST, wifiPortalHandleSave);
  wifiPortalServer.begin();
  Serial.println("No saved WiFi worked. Setup hotspot started: \"" + apName + "\" (open network).");
  Serial.print("Connect a phone to it, then open http://");
  Serial.println(WiFi.softAPIP());
}

void wifiPortalLoop() {
  if (!wifiPortalActive) return;
  wifiDnsServer.processNextRequest();
  wifiPortalServer.handleClient();
  // Don't stay stuck in setup mode forever — retry saved networks every
  // 3 minutes in case one comes back (e.g. router just rebooted).
  if (millis() - wifiPortalStartMs > 180000UL) {
    wifiPortalActive = false;
    wifiDnsServer.stop();
    wifiPortalServer.stop();
    WiFi.softAPdisconnect(true);
    WiFi.mode(WIFI_STA);
  }
}

// ---- Public API used from the main sketch ----
void wifiMultiInit() {
  if (!LittleFS.begin()) {
    LittleFS.format();
    LittleFS.begin();
  }
  wifiLoadNetworks();
  wifiApplyToMulti();
  WiFi.mode(WIFI_STA);
}

bool wifiMultiConnect(unsigned long timeoutMs) {
  unsigned long start = millis();
  Serial.print("WiFi connecting (multi)");
  while (wifiMulti.run() != WL_CONNECTED && millis() - start < timeoutMs) {
    delay(300);
    Serial.print(".");
  }
  Serial.println();
  if (WiFi.status() == WL_CONNECTED) {
    Serial.print("WiFi connected to \"");
    Serial.print(WiFi.SSID());
    Serial.print("\", IP: ");
    Serial.println(WiFi.localIP());
    return true;
  }
  return false;
}

// Call from mqttCallback() when topic == topicWifiSet().
void wifiHandleListUpdate(const String &jsonPayload) {
  StaticJsonDocument<1024> doc;
  if (deserializeJson(doc, jsonPayload) != DeserializationError::Ok || !doc.is<JsonArray>()) return;
  WifiNet incoming[MAX_WIFI_NETWORKS];
  int n = 0;
  for (JsonObject o : doc.as<JsonArray>()) {
    if (n >= MAX_WIFI_NETWORKS) break;
    const char* ssid = o["ssid"] | "";
    if (strlen(ssid) == 0) continue;
    incoming[n].ssid = ssid;
    incoming[n].password = (const char*)(o["password"] | "");
    n++;
  }
  if (n == 0) return;
  wifiNetCount = n;
  for (int i = 0; i < n; i++) wifiNets[i] = incoming[i];
  wifiSaveNetworks();
  wifiApplyToMulti();
  Serial.println("WiFi network list updated from app (" + String(n) + " networks saved).");
}

// Retained state JSON for the app's WiFi Settings screen: known SSIDs
// (no passwords, ever) + which one we're on right now.
String wifiBuildStateJson() {
  StaticJsonDocument<512> doc;
  JsonArray arr = doc.createNestedArray("networks");
  for (int i = 0; i < wifiNetCount; i++) arr.add(wifiNets[i].ssid);
  doc["connected"] = (WiFi.status() == WL_CONNECTED) ? WiFi.SSID() : "";
  String out;
  serializeJson(doc, out);
  return out;
}
