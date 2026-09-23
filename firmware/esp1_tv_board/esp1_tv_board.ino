// =========================================================================
//  ESP1 — "TV Board"
//  Controls: AC (relay1), TV (relay2), Socket 1 (relay3), Socket 2 (relay4)
//  Plus, per relay: auto-off timer, daily auto-off schedule (NTP), and
//  (relay1 / AC only) Sleep Mode — cycles 15 min ON / 15 min OFF.
//
//  Required libraries (Arduino IDE -> Sketch -> Include Library ->
//  Manage Libraries -> search & install):
//    - PubSubClient        by Nick O'Leary
//    - ArduinoJson (v6.x)  by Benoit Blanchon
//
//  Board: "NodeMCU 1.0 (ESP-12E Module)" (Tools -> Board)
//
//  MQTT contract (must match src/config.js + src/mqttClient.js in the app).
//  <ch> is relay1 (AC) / relay2 (TV) / relay3 (Socket1) / relay4 (Socket2):
//    <prefix>/tvboard/<ch>/set              "1"/"0"    app -> ESP
//    <prefix>/tvboard/<ch>/state            "1"/"0"    ESP -> app (retained)
//    <prefix>/tvboard/<ch>/timer/set        seconds    app -> ESP ("0" cancels)
//    <prefix>/tvboard/<ch>/timer/state      seconds    ESP -> app (retained, "0"=none)
//    <prefix>/tvboard/<ch>/schedule/set     "HH:MM"    app -> ESP (""=cancel)
//    <prefix>/tvboard/<ch>/schedule/state   "HH:MM"    ESP -> app (retained, ""=none)
//    <prefix>/tvboard/relay1/sleep/set        "1"/"0"  app -> ESP (AC only, cycle on/off)
//    <prefix>/tvboard/relay1/sleep/state      "1"/"0"  ESP -> app (retained)
//    <prefix>/tvboard/relay1/sleep/config/set   JSON   app -> ESP (AC only, retained)
//         {"onMin":15,"offMin":15,"start":"HH:MM","end":"HH:MM","maxHours":6}
//         start/end "" = cycle anytime sleep is on. maxHours 0 = no cap.
//    <prefix>/tvboard/relay1/sleep/config/state JSON   ESP -> app (retained, echoes above)
//    <prefix>/tvboard/curfew/set              JSON     app -> ESP (retained, per-BOARD)
//         {"time":"HH:MM","channels":["relay2","relay3"]}
//         -> every listed channel force-OFF at that clock time, daily
//    <prefix>/tvboard/curfew/state            JSON     ESP -> app (retained, echoes above)
//    <prefix>/tvboard/status                JSON       ESP -> app (retained, has LWT)
//    <prefix>/tvboard/wifi/list/set         JSON       app -> ESP  [{"ssid":"..","password":".."},...]
//                                                       (poori list REPLACE karta hai, flash me save)
//    <prefix>/tvboard/wifi/list/state       JSON       ESP -> app (retained)
//                                                       {"networks":["ssid1","ssid2"],"connected":"ssid_in_use"}
//
//  WiFi multi-network storage + "SmartHome-Setup-XXXX" recovery hotspot
//  ki poori detail wifi_manager.h/.cpp me hai (isi folder me, dusra tab).
// =========================================================================

#include <ESP8266WiFi.h>
#define MQTT_MAX_PACKET_SIZE 512
#include <PubSubClient.h>
#include <ArduinoJson.h>
#include <time.h>

#include "config.h"
#include "wifi_manager.h"

#if MQTT_USE_TLS
#include <WiFiClientSecure.h>
WiFiClientSecure espClient;
#else
WiFiClient espClient;
#endif
PubSubClient mqtt(espClient);

bool ledOn = false;
unsigned long lastLedToggleMs = 0;

const int RELAY_COUNT = 4;
int relayPins[RELAY_COUNT] = {RELAY1_PIN, RELAY2_PIN, RELAY3_PIN, RELAY4_PIN};

// "Logical" desired state (what the user asked for) vs. physical relay
// output (which sleep mode can override to briefly force OFF).
bool relayState[RELAY_COUNT] = {false, false, false, false};
bool relayPhysical[RELAY_COUNT] = {false, false, false, false};

// ---- per-relay timer (auto-off after X seconds) ----
unsigned long timerDeadlineMs[RELAY_COUNT] = {0, 0, 0, 0}; // 0 = disabled
unsigned long lastTimerPublishMs[RELAY_COUNT] = {0, 0, 0, 0};

// ---- per-relay daily schedule (auto-off at HH:MM, on chosen days) ----
int scheduleMinuteOfDay[RELAY_COUNT] = {-1, -1, -1, -1}; // -1 = disabled
uint8_t scheduleDaysMask[RELAY_COUNT] = {0x7F, 0x7F, 0x7F, 0x7F}; // bit i = day i (0=Sun..6=Sat), default = every day
int scheduleFiredForMinute[RELAY_COUNT] = {-1, -1, -1, -1}; // guards re-firing within same minute

// ---- Sleep mode (relay1 / AC only): simple ON-min / OFF-min cycle ----
// Config is entirely app-controlled (sleep/config/set) — no hardcoded
// values baked into the firmware, so changing the cycle never needs a
// reflash.
bool sleepEnabled = false;
bool sleepPhaseOff = false;
unsigned long sleepPhaseStartMs = 0;
unsigned long sleepEnabledAtMs = 0;   // when Sleep Mode was last turned on (for maxHours cap)
int sleepOnMin = 15;                  // minutes ON per cycle
int sleepOffMin = 15;                 // minutes OFF per cycle
int sleepMaxHours = 0;                // 0 = no cap; >0 = auto-stop the whole cycle after this many hours
bool sleepUseWindow = false;          // true = only cycle inside [sleepStartMin, sleepEndMin)
int sleepStartMin = -1;               // minute-of-day, wraps past midnight if start > end
int sleepEndMin = -1;

// ---- Switch Curfew (per-BOARD, not per-appliance): force listed channels
// OFF at a shared clock time every night, e.g. TV/sockets off at 12:00 AM.
// Whichever channels are NOT listed are simply left alone (never touched).
int curfewMinuteOfDay = -1;           // -1 = disabled
int curfewFiredForMinute = -1;
bool curfewChannel[RELAY_COUNT] = {false, false, false, false};

bool ntpSynced = false;
unsigned long lastReconnectAttempt = 0;
unsigned long lastStatusPublish = 0;

// ------------------------------------------------------------------------
// Topic helpers
// ------------------------------------------------------------------------
String chanName(int n) { return "relay" + String(n); }
String topicRelaySet(int n)      { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(n) + "/set"; }
String topicRelayState(int n)    { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(n) + "/state"; }
String topicTimerSet(int n)      { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(n) + "/timer/set"; }
String topicTimerState(int n)    { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(n) + "/timer/state"; }
String topicScheduleSet(int n)   { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(n) + "/schedule/set"; }
String topicScheduleState(int n) { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(n) + "/schedule/state"; }
String topicSleepSet()           { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(SLEEP_CAPABLE_RELAY) + "/sleep/set"; }
String topicSleepState()         { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(SLEEP_CAPABLE_RELAY) + "/sleep/state"; }
String topicSleepConfigSet()     { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(SLEEP_CAPABLE_RELAY) + "/sleep/config/set"; }
String topicSleepConfigState()   { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/" + chanName(SLEEP_CAPABLE_RELAY) + "/sleep/config/state"; }
String topicCurfewSet()          { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/curfew/set"; }
String topicCurfewState()        { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/curfew/state"; }
String topicStatus()             { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/status"; }
String topicWifiListSet()        { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/wifi/list/set"; }
String topicWifiListState()      { return String(TOPIC_PREFIX) + "/" + NODE_ID + "/wifi/list/state"; }

// ------------------------------------------------------------------------
// Relay control
// ------------------------------------------------------------------------
void writePhysical(int n, bool on) { // n is 1-based
  relayPhysical[n - 1] = on;
  bool level = RELAY_ACTIVE_LOW ? !on : on;
  digitalWrite(relayPins[n - 1], level ? HIGH : LOW);
}

// Sets the LOGICAL (user-requested) state, publishes it, and clears any
// running timer/sleep phase so a fresh command always "just works".
void setRelay(int n, bool on, bool clearTimer = true) {
  relayState[n - 1] = on;
  if (clearTimer) {
    timerDeadlineMs[n - 1] = 0;
    mqtt.publish(topicTimerState(n).c_str(), "0", true);
  }
  if (n == SLEEP_CAPABLE_RELAY) {
    sleepPhaseOff = false;
    sleepPhaseStartMs = millis();
    writePhysical(n, on); // start a fresh cycle straight in the ON phase
  } else {
    writePhysical(n, on);
  }
  mqtt.publish(topicRelayState(n).c_str(), on ? "1" : "0", true);
}

// ------------------------------------------------------------------------
// Sleep mode (AC / relay1 only) — simple ON-min / OFF-min cycle.
// Optional clock window and optional max-runtime cap, both purely
// app-configured (see setSleepConfig() below) — nothing hardcoded here.
// ------------------------------------------------------------------------
bool minuteInWindow(int nowMin, int startMin, int endMin) {
  if (startMin <= endMin) return (nowMin >= startMin && nowMin < endMin);
  return (nowMin >= startMin || nowMin < endMin); // window wraps past midnight
}

void handleSleepMode() {
  int n = SLEEP_CAPABLE_RELAY;
  if (!sleepEnabled || !relayState[n - 1]) return; // only cycles while AC is logically ON

  // Auto-off-after-N-hours cap: stops the WHOLE cycle for good (AC goes
  // back to fully on) once this many hours have passed since Sleep Mode
  // was switched on. 0 = no cap, keeps cycling indefinitely.
  if (sleepMaxHours > 0) {
    unsigned long capMs = (unsigned long)sleepMaxHours * 3600UL * 1000UL;
    if (millis() - sleepEnabledAtMs >= capMs) {
      sleepEnabled = false;
      writePhysical(n, relayState[n - 1]); // back to fully ON (matches logical state)
      mqtt.publish(topicSleepState().c_str(), "0", true);
      return;
    }
  }

  // Optional clock window: outside it, AC stays fully ON (untouched by
  // sleep cycling) instead of turning off.
  if (sleepUseWindow && ntpSynced) {
    time_t now = time(nullptr);
    struct tm *t = localtime(&now);
    int nowMin = t->tm_hour * 60 + t->tm_min;
    if (!minuteInWindow(nowMin, sleepStartMin, sleepEndMin)) {
      if (!relayPhysical[n - 1]) writePhysical(n, true);
      return;
    }
  }

  unsigned long phaseMs = (unsigned long)(sleepPhaseOff ? sleepOffMin : sleepOnMin) * 60000UL;
  unsigned long elapsed = millis() - sleepPhaseStartMs;
  if (elapsed >= phaseMs) {
    sleepPhaseStartMs = millis();
    sleepPhaseOff = !sleepPhaseOff;
    writePhysical(n, !sleepPhaseOff); // physical relay only; relayState (logical) stays "on"
  }
}

// App sends the whole config as one retained JSON blob each time it
// changes (onMin/offMin/window/maxHours together) — simplest possible
// contract, no partial updates to track.
void setSleepConfig(const String &msg) {
  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, msg) != DeserializationError::Ok) return;

  int onMin = doc["onMin"] | sleepOnMin;
  int offMin = doc["offMin"] | sleepOffMin;
  sleepOnMin = onMin < 1 ? 1 : onMin;
  sleepOffMin = offMin < 1 ? 1 : offMin;
  sleepMaxHours = doc["maxHours"] | 0;

  const char *start = doc["start"] | "";
  const char *end = doc["end"] | "";
  int sMin, eMin;
  if (strlen(start) > 0 && strlen(end) > 0 && parseHHMM(String(start), &sMin) && parseHHMM(String(end), &eMin)) {
    sleepUseWindow = true;
    sleepStartMin = sMin;
    sleepEndMin = eMin;
  } else {
    sleepUseWindow = false;
  }

  mqtt.publish(topicSleepConfigState().c_str(), msg.c_str(), true); // echo back, retained
}

// ------------------------------------------------------------------------
// Switch Curfew (per-BOARD): force listed channels OFF at a shared clock
// time every night, e.g. {"time":"00:00","channels":["relay1","relay3","relay4"]}
// turns AC + both sockets off at midnight while leaving TV (relay2, if
// left out of the list) completely untouched.
// ------------------------------------------------------------------------
void setCurfew(const String &msg) {
  for (int i = 0; i < RELAY_COUNT; i++) curfewChannel[i] = false;

  StaticJsonDocument<256> doc;
  if (deserializeJson(doc, msg) != DeserializationError::Ok) {
    curfewMinuteOfDay = -1;
    mqtt.publish(topicCurfewState().c_str(), "", true);
    return;
  }

  const char *timeStr = doc["time"] | "";
  int minuteOfDay;
  if (strlen(timeStr) > 0 && parseHHMM(String(timeStr), &minuteOfDay)) {
    curfewMinuteOfDay = minuteOfDay;
    curfewFiredForMinute = -1;
  } else {
    curfewMinuteOfDay = -1;
  }

  JsonArray channels = doc["channels"].as<JsonArray>();
  if (!channels.isNull()) {
    for (JsonVariant v : channels) {
      String ch = v.as<String>();
      for (int n = 1; n <= RELAY_COUNT; n++) {
        if (ch == chanName(n)) curfewChannel[n - 1] = true;
      }
    }
  }

  mqtt.publish(topicCurfewState().c_str(), msg.c_str(), true); // echo back, retained
}

void handleCurfew() {
  if (!ntpSynced || curfewMinuteOfDay < 0) return;
  time_t now = time(nullptr);
  struct tm *t = localtime(&now);
  int nowMinuteOfDay = t->tm_hour * 60 + t->tm_min;

  if (nowMinuteOfDay == curfewMinuteOfDay) {
    if (curfewFiredForMinute != nowMinuteOfDay) {
      curfewFiredForMinute = nowMinuteOfDay;
      for (int n = 1; n <= RELAY_COUNT; n++) {
        if (curfewChannel[n - 1]) setRelay(n, false); // force off, same as a normal command
      }
    }
  } else if (curfewFiredForMinute == curfewMinuteOfDay && nowMinuteOfDay != curfewMinuteOfDay) {
    curfewFiredForMinute = -1; // arm again for tomorrow
  }
}

// ------------------------------------------------------------------------
// Timer (auto-off after X seconds)
// ------------------------------------------------------------------------
void startTimer(int n, unsigned long secs) {
  if (secs == 0) {
    timerDeadlineMs[n - 1] = 0;
    mqtt.publish(topicTimerState(n).c_str(), "0", true);
    return;
  }
  timerDeadlineMs[n - 1] = millis() + secs * 1000UL;
  mqtt.publish(topicTimerState(n).c_str(), String(secs).c_str(), true);
  lastTimerPublishMs[n - 1] = millis();
}

void handleTimers() {
  unsigned long now = millis();
  for (int i = 0; i < RELAY_COUNT; i++) {
    if (timerDeadlineMs[i] == 0) continue;
    int n = i + 1;
    if ((long)(timerDeadlineMs[i] - now) <= 0) {
      timerDeadlineMs[i] = 0;
      setRelay(n, false, false); // don't re-clear (already cleared below)
      mqtt.publish(topicTimerState(n).c_str(), "0", true);
    } else if (now - lastTimerPublishMs[i] > 10000) { // refresh remaining every ~10s
      lastTimerPublishMs[i] = now;
      unsigned long remaining = (timerDeadlineMs[i] - now) / 1000UL;
      mqtt.publish(topicTimerState(n).c_str(), String(remaining).c_str(), true);
    }
  }
}

// ------------------------------------------------------------------------
// Daily schedule (auto-off at HH:MM, via NTP time)
// ------------------------------------------------------------------------
bool parseHHMM(const String &s, int *outMinuteOfDay) {
  int colon = s.indexOf(':');
  if (colon < 1) return false;
  int h = s.substring(0, colon).toInt();
  int m = s.substring(colon + 1).toInt();
  if (h < 0 || h > 23 || m < 0 || m > 59) return false;
  *outMinuteOfDay = h * 60 + m;
  return true;
}

// Accepts the new {"time":"HH:MM","days":[0..6]} JSON (0=Sun..6=Sat), and
// still understands an old plain "HH:MM" string (treated as every day)
// for backward compatibility. "" (or bad JSON) cancels the schedule.
void setSchedule(int n, const String &msg) {
  if (msg.length() == 0) {
    scheduleMinuteOfDay[n - 1] = -1;
    mqtt.publish(topicScheduleState(n).c_str(), "", true);
    return;
  }

  int minuteOfDay = -1;
  uint8_t mask = 0x7F; // default: every day
  bool ok = false;

  StaticJsonDocument<192> doc;
  if (deserializeJson(doc, msg) == DeserializationError::Ok && doc.containsKey("time")) {
    ok = parseHHMM(doc["time"].as<String>(), &minuteOfDay);
    if (ok) {
      JsonArray days = doc["days"].as<JsonArray>();
      if (!days.isNull() && days.size() > 0) {
        mask = 0;
        for (JsonVariant v : days) {
          int d = v.as<int>();
          if (d >= 0 && d <= 6) mask |= (1 << d);
        }
      }
    }
  } else {
    ok = parseHHMM(msg, &minuteOfDay); // old plain "HH:MM" format
  }

  if (!ok) {
    scheduleMinuteOfDay[n - 1] = -1;
    mqtt.publish(topicScheduleState(n).c_str(), "", true);
    return;
  }
  scheduleMinuteOfDay[n - 1] = minuteOfDay;
  scheduleDaysMask[n - 1] = mask;
  scheduleFiredForMinute[n - 1] = -1;
  mqtt.publish(topicScheduleState(n).c_str(), msg.c_str(), true);
}

void handleSchedules() {
  if (!ntpSynced) return;
  time_t now = time(nullptr);
  struct tm *t = localtime(&now);
  int nowMinuteOfDay = t->tm_hour * 60 + t->tm_min;
  int today = t->tm_wday; // 0=Sun..6=Sat — matches the app's day numbering

  for (int i = 0; i < RELAY_COUNT; i++) {
    if (scheduleMinuteOfDay[i] < 0) continue;
    int n = i + 1;
    bool todaySelected = scheduleDaysMask[i] & (1 << today);
    if (nowMinuteOfDay == scheduleMinuteOfDay[i]) {
      if (todaySelected && scheduleFiredForMinute[i] != nowMinuteOfDay) {
        scheduleFiredForMinute[i] = nowMinuteOfDay;
        setRelay(n, false); // schedule always switches OFF, as requested
      }
    } else if (scheduleFiredForMinute[i] == scheduleMinuteOfDay[i] && nowMinuteOfDay != scheduleMinuteOfDay[i]) {
      // minute has moved on, arm it again for tomorrow
      scheduleFiredForMinute[i] = -1;
    }
  }
}

// ------------------------------------------------------------------------
// MQTT
// ------------------------------------------------------------------------
void publishStatus(bool online) {
  StaticJsonDocument<192> doc;
  doc["online"] = online;
  if (online) {
    doc["ip"] = WiFi.localIP().toString();
    doc["wifi"] = WiFi.RSSI();
  }
  char out[192];
  size_t n = serializeJson(doc, out);
  mqtt.publish(topicStatus().c_str(), (const uint8_t *)out, n, true); // retained
}

void publishWifiState() {
  mqtt.publish(topicWifiListState().c_str(), wmStatusJson().c_str(), true); // retained
}

// App se poori WiFi list (JSON array) aati hai — [{"ssid":"..","password":".."},...].
// Poori saved list REPLACE ho jaati hai aur flash me save ho jaati hai.
// Current live connection turant nahi tootta — agli baar disconnect/
// reconnect hone par (ya turant, agar naya list turant try karna ho to
// board ko manually reboot/power-cycle karna padega) naya list use hoga.
void handleWifiListSet(const String &msg) {
  DynamicJsonDocument doc(768);
  DeserializationError err = deserializeJson(doc, msg);
  if (err || !doc.is<JsonArray>()) {
    Serial.println("[wifi] bad wifi/list/set payload, ignoring");
    return;
  }
  WmNetwork nets[WM_MAX_NETWORKS];
  int count = 0;
  for (JsonVariant v : doc.as<JsonArray>()) {
    if (count >= WM_MAX_NETWORKS) break;
    const char *ssid = v["ssid"] | "";
    const char *pass = v["password"] | "";
    if (strlen(ssid) == 0) continue;
    strncpy(nets[count].ssid, ssid, WM_SSID_LEN - 1);
    nets[count].ssid[WM_SSID_LEN - 1] = 0;
    strncpy(nets[count].pass, pass, WM_PASS_LEN - 1);
    nets[count].pass[WM_PASS_LEN - 1] = 0;
    count++;
  }
  wmSaveNetworks(nets, count);
  Serial.printf("[wifi] saved %d network(s) from app\n", count);
  publishWifiState();
}

void mqttCallback(char *topic, byte *payload, unsigned int length) {
  String t = String(topic);
  String msg;
  msg.reserve(length);
  for (unsigned int i = 0; i < length; i++) msg += (char)payload[i];

  Serial.print("[MQTT IN] ");
  Serial.print(t);
  Serial.print(" = ");
  Serial.println(msg);

  if (t == topicWifiListSet()) {
    handleWifiListSet(msg);
    return;
  }

  if (t == topicSleepConfigSet()) {
    setSleepConfig(msg);
    return;
  }

  if (t == topicCurfewSet()) {
    setCurfew(msg);
    return;
  }

  for (int n = 1; n <= RELAY_COUNT; n++) {
    if (t == topicRelaySet(n)) {
      setRelay(n, msg == "1" || msg == "ON" || msg == "on");
      return;
    }
    if (t == topicTimerSet(n)) {
      startTimer(n, (unsigned long)msg.toInt());
      return;
    }
    if (t == topicScheduleSet(n)) {
      setSchedule(n, msg);
      return;
    }
  }

  if (t == topicSleepSet()) {
    sleepEnabled = (msg == "1" || msg == "ON" || msg == "on");
    sleepPhaseOff = false;
    sleepPhaseStartMs = millis();
    sleepEnabledAtMs = millis(); // (re)start the maxHours cap from this moment
    if (!sleepEnabled && relayState[SLEEP_CAPABLE_RELAY - 1]) {
      writePhysical(SLEEP_CAPABLE_RELAY, true); // back to fully ON
    }
    mqtt.publish(topicSleepState().c_str(), sleepEnabled ? "1" : "0", true);
  }
}

bool mqttReconnect() {
  String clientId = "sh_tvboard_" + String(ESP.getChipId(), HEX);
  bool ok;
  String willTopic = topicStatus();
  const char *willMsg = "{\"online\":false}";

  if (strlen(MQTT_USER) > 0) {
    ok = mqtt.connect(clientId.c_str(), MQTT_USER, MQTT_PASSWORD,
                       willTopic.c_str(), 0, true, willMsg);
  } else {
    ok = mqtt.connect(clientId.c_str(), willTopic.c_str(), 0, true, willMsg);
  }

  Serial.print("MQTT connect ");
  Serial.println(ok ? "OK" : ("FAILED, rc=" + String(mqtt.state())));

  if (ok) {
    for (int n = 1; n <= RELAY_COUNT; n++) {
      mqtt.subscribe(topicRelaySet(n).c_str());
      mqtt.subscribe(topicTimerSet(n).c_str());
      mqtt.subscribe(topicScheduleSet(n).c_str());
    }
    mqtt.subscribe(topicSleepSet().c_str());
    mqtt.subscribe(topicSleepConfigSet().c_str());
    mqtt.subscribe(topicCurfewSet().c_str());
    mqtt.subscribe(topicWifiListSet().c_str());
    publishStatus(true);
    publishWifiState();
    for (int n = 1; n <= RELAY_COUNT; n++) {
      mqtt.publish(topicRelayState(n).c_str(), relayState[n - 1] ? "1" : "0", true);
      unsigned long remaining = 0;
      if (timerDeadlineMs[n - 1] && timerDeadlineMs[n - 1] > millis()) {
        remaining = (timerDeadlineMs[n - 1] - millis()) / 1000UL;
      }
      mqtt.publish(topicTimerState(n).c_str(), String(remaining).c_str(), true);
    }
    mqtt.publish(topicSleepState().c_str(), sleepEnabled ? "1" : "0", true);
  }
  return ok;
}

// ------------------------------------------------------------------------
// WiFi / NTP
// ------------------------------------------------------------------------
// Multi-network connect, app-updatable + recovery-hotspot logic ab
// wifi_manager.h/.cpp me hai (wmBegin() / wmLoop()). NTP sirf ek baar
// start karna hai jab pehli baar WiFi connect ho jaaye.
bool ntpStarted = false;
void maybeStartNtp() {
  if (ntpStarted || WiFi.status() != WL_CONNECTED) return;
  ntpStarted = true;
  configTime(NTP_TZ_OFFSET_SEC, 0, NTP_SERVER_1, NTP_SERVER_2);
}

void checkNtp() {
  if (ntpSynced) return;
  time_t now = time(nullptr);
  if (now > 100000) { // any sane epoch value means NTP has synced
    ntpSynced = true;
    Serial.println("NTP time synced.");
  }
}

// ------------------------------------------------------------------------
// Status LED — blinks while WiFi/MQTT are still connecting, goes solid
// ON once both are up. LED_BUILTIN on most ESP8266 boards is active LOW
// (LOW = on), which is why the logic below looks inverted.
// ------------------------------------------------------------------------
void updateStatusLed() {
  bool fullyConnected = (WiFi.status() == WL_CONNECTED) && mqtt.connected();
  if (fullyConnected) {
    digitalWrite(STATUS_LED_PIN, LOW); // solid ON
    return;
  }
  unsigned long now = millis();
  if (now - lastLedToggleMs >= 400) {
    lastLedToggleMs = now;
    ledOn = !ledOn;
    digitalWrite(STATUS_LED_PIN, ledOn ? LOW : HIGH);
  }
}

// ------------------------------------------------------------------------
// Setup / loop
// ------------------------------------------------------------------------
void setup() {
  Serial.begin(115200);
  delay(200);

  for (int i = 0; i < RELAY_COUNT; i++) {
    pinMode(relayPins[i], OUTPUT);
  }
  for (int n = 1; n <= RELAY_COUNT; n++) {
    writePhysical(n, false); // all relays start OFF
  }

  pinMode(STATUS_LED_PIN, OUTPUT);
  digitalWrite(STATUS_LED_PIN, HIGH); // start OFF (active LOW)

  wmBegin(); // saved WiFi networks try karta hai, na milne par setup hotspot khol deta hai
  maybeStartNtp();

#if MQTT_USE_TLS
  // Skips certificate validation (common for hobby projects). Good
  // enough since the connection is still fully TLS-encrypted end to
  // end — it just doesn't verify HiveMQ Cloud's certificate chain.
  // For stricter security, replace with espClient.setTrustAnchors(...)
  // using HiveMQ Cloud's CA certificate.
  espClient.setInsecure();
#endif

  mqtt.setServer(MQTT_HOST, MQTT_PORT);
  mqtt.setCallback(mqttCallback);
  mqtt.setBufferSize(512);
}

void loop() {
  bool wifiOk = wmLoop(); // saved networks retry karta hai; setup hotspot chalu ho to usko service karta hai
  if (wifiOk) maybeStartNtp();
  checkNtp();

  if (wifiOk) {
    if (!mqtt.connected()) {
      unsigned long now = millis();
      if (now - lastReconnectAttempt > 4000) {
        lastReconnectAttempt = now;
        if (mqttReconnect()) lastReconnectAttempt = 0;
      }
    } else {
      mqtt.loop();
    }
  }

  handleTimers();
  handleSchedules();
  handleSleepMode();
  handleCurfew();
  updateStatusLed();

  if (mqtt.connected() && millis() - lastStatusPublish > 30000) {
    lastStatusPublish = millis();
    publishStatus(true);
  }
}
