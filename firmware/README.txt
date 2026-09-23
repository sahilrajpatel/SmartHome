================================================================
 SMARTHOME HUB — ESP8266 FIRMWARE (2 boards, 4 relay each)
 Setup, wiring aur flashing — step by step
================================================================

Do boards hain, app ke src/config.js se exactly match karte hain:

  ESP1 = "TV Board"   (node id: tvboard)
    - AC        -> Relay 1   (Sleep Mode: 15 min ON / 15 min OFF cycle)
    - TV        -> Relay 2
    - Socket 1  -> Relay 3
    - Socket 2  -> Relay 4

  ESP2 = "Fan Board"  (node id: fanboard)
    - Bulb 1  -> Relay 1
    - Bulb 2  -> Relay 2
    - Fan     -> Relay 3
    - Socket  -> Relay 4
    - IR transceiver (the Adafruit IR module) -> works as the remote
      for the AC + TV on the TV Board (learn + replay from app's
      Remote tab)

Har relay (dono boards pe) ye teen feature support karta hai, jo app
ke gear-icon bottom-sheet se control hote hain:
  - AUTO-OFF TIMER  (15m/30m/1h/2h/4h ke baad khud off)
  - DAILY SCHEDULE  (har din HH:MM pe khud off — board NTP se time
                     leta hai, RTC module ki zaroorat nahi)
  - SLEEP MODE      (sirf AC / tvboard relay1 — 15 min ON / 15 min
                     OFF cycle, jab tak AC on rakha hai)

Dono boards same MQTT broker se connect hote hain jo app ke Settings
tab me daala hai. Ab dono taraf (app + firmware) SECURE (TLS-encrypted)
connection use karte hain, aur default already tumhare HiveMQ Cloud
instance par set hai:

    Host : f4a2080940a6437ebf6500cb6f9b15e1.s1.eu.hivemq.cloud
    Port : 8883 (firmware, plain TLS)  /  8884 (app, TLS WebSocket)

HiveMQ Cloud par HAMESHA username + password chahiye hota hai — HiveMQ
Cloud console me "Access Management" tab me jaake ek credential banao,
phir wahi username/password:
  - firmware ke dono config.h me MQTT_USER / MQTT_PASSWORD me bharo
  - app ke Settings tab me USERNAME / PASSWORD me bharo (ek baar bharo,
    permanently save ho jayega, phir se dalne ki zaroorat nahi)

--------------------------------------------------------------
FOLDER STRUCTURE
--------------------------------------------------------------
  esp1_tv_board/
      esp1_tv_board.ino   -> main firmware
      config.h            -> yahan apni broker details + (optional,
                             pehli baar ke liye) factory-default WiFi bharo
      wifi_manager.h/.cpp -> multi-network WiFi storage + setup hotspot
                             (dono boards me same, neeche "WIFI SETUP"
                             section me poori detail hai)
  esp2_fan_board/
      esp2_fan_board.ino  -> main firmware
      config.h            -> yahan apni broker details + (optional,
                             pehli baar ke liye) factory-default WiFi bharo
      wifi_manager.h/.cpp -> multi-network WiFi storage + setup hotspot

Sirf yehi 2 ESP8266 board hain — jo bhi board tumhare paas hai (photo
me dikhaya "NodeMCU ESP8266 CP2102 Amica" type module), usi ke liye ye
dono folder use karo. Arduino IDE me har folder ko alag se ek sketch ki
tarah kholna — sab files (.ino + config.h + wifi_manager.h/.cpp) SAME
folder me hone chahiye, jaisa upar diya hai (Arduino IDE apne aap baaki
files ko tabs me dikha dega).

--------------------------------------------------------------
STEP 1 — Arduino IDE me ESP8266 board support install karna
--------------------------------------------------------------
  1. Arduino IDE kholo -> File -> Preferences.
  2. "Additional Boards Manager URLs" me ye URL daalo:
       https://arduino.esp8266.com/stable/package_esp8266com_index.json
  3. Tools -> Board -> Boards Manager -> "esp8266" search karke
     install karo (by ESP8266 Community).
  4. Tools -> Board me se "NodeMCU 1.0 (ESP-12E Module)" select karo
     (jo bhi tumhara actual board hai — NodeMCU/Wemos D1 mini dono
     chalega, bas pin naming thodi alag ho sakti hai).

--------------------------------------------------------------
STEP 2 — Library install karna
--------------------------------------------------------------
Tools -> Manage Libraries me jaake ye sab install karo:

  esp1_tv_board  (sirf ye 2 chahiye):
    - "PubSubClient" by Nick O'Leary
    - "ArduinoJson" (v6.x) by Benoit Blanchon

  esp2_fan_board (upar wale 2 + ye ek extra, IR ke liye):
    - "PubSubClient" by Nick O'Leary
    - "ArduinoJson" (v6.x) by Benoit Blanchon
    - "IRremoteESP8266" by David Conran / crankyoldgit

--------------------------------------------------------------
STEP 3 — config.h bharna (dono boards ke liye)
--------------------------------------------------------------
Har board ke folder me config.h file kholo aur ye values badlo:

  WIFI_SSID / WIFI_PASSWORD  -> optional "factory default" — sirf pehli
                                baar flash karte waqt use hota hai (agar
                                apna WiFi pehle se pata hai to daal do,
                                convenient rahega). Khali ("") bhi chhod
                                sakte ho — tab board pehli baar boot hote
                                hi seedha apna setup hotspot khol dega.
                                Baad me router ka password badal jaaye to
                                YE FILE dobara EDIT/UPLOAD karne ki
                                zaroorat NAHI — agla "WIFI SETUP" section
                                padho.
  MQTT_USE_TLS                 -> true rakho HiveMQ Cloud (ya kisi bhi
                                TLS broker) ke liye — already true set
                                hai, code khud WiFiClientSecure use kar
                                lega. Sirf local plain Mosquitto/test
                                broker (no TLS) use karna ho to false
                                karo.
  MQTT_HOST / MQTT_PORT       -> already tumhare HiveMQ Cloud instance
                                par set hai (hostname + 8883, plain
                                TLS — WSS wala URL yahan nahi, wo sirf
                                app me hota hai)
  MQTT_USER / MQTT_PASSWORD   -> HiveMQ Cloud ke Access Management se
                                banaya gaya username/password (REQUIRED
                                for HiveMQ Cloud)
  TOPIC_PREFIX                -> app ke Settings tab ke "TOPIC PREFIX"
                                se EXACTLY match hona chahiye

NODE_ID pehle se sahi set hai ("tvboard" / "fanboard") — usko mat
badlo jab tak app ke src/config.js me bhi naam na badlo.

NTP_TZ_OFFSET_SEC pehle se India (IST, +5:30 = 19800) set hai — Daily
Schedule feature isi se apna time leta hai, RTC module lagane ki
zaroorat nahi (WiFi hote hi auto-sync ho jaata hai).

--------------------------------------------------------------
STEP 4 — Wiring
--------------------------------------------------------------
  Relay module ka IN pin -> ESP ka GPIO pin (config.h me diya hai)
  Relay module VCC/GND    -> agar 5V relay module hai to alag 5V
                             supply use karo, GND common rakho ESP
                             ke saath.

  ESP1 (TV Board):
    D1 (GPIO5)  -> Relay 1 IN   (AC)
    D2 (GPIO4)  -> Relay 2 IN   (TV)
    D6 (GPIO12) -> Relay 3 IN   (Socket 1)
    D7 (GPIO13) -> Relay 4 IN   (Socket 2)

  ESP2 (Fan Board):
    D1 (GPIO5)  -> Relay 1 IN   (Bulb 1)
    D2 (GPIO4)  -> Relay 2 IN   (Bulb 2)
    D0 (GPIO16) -> Relay 3 IN   (Fan)
    D7 (GPIO13) -> Relay 4 IN   (Socket)
    D6 (GPIO12) -> IR LED (via NPN transistor e.g. BC547/2N2222,
                   IR_SEND_PIN) -> AC + TV ko control karega
    D5 (GPIO14) -> IR receiver module OUT (TSOP1738/VS1838B/the
                   Adafruit IR receiver, IR_RECV_PIN) -> learn mode
                   ke liye asli remote yahi module padhega

  IMPORTANT — Mains (220V) wiring khud se karte waqt bahut dhyan
  rakhna: relay module ke COM/NO/NC terminals hi 220V side hain,
  baaki sab (IN, VCC, GND) low-voltage side hai. Agar pakka pata
  na ho to kisi trained electrician se karwao.

  Zyaadatar relay modules "active LOW" hote hain (LOW signal =
  relay ON). config.h me RELAY_ACTIVE_LOW true set hai — agar
  tumhara module ulta kaam kare (relay ON hi na ho ya hamesha ON
  rahe) to isko false kar do.

  GPIO0/GPIO2/GPIO15 (D3/D4/D8) aur GPIO1/GPIO3 (D10/D9, Serial
  TX/RX) jaan-bujh kar avoid kiye gaye hain taaki bootup ya Serial
  Monitor me dikkat na ho.

--------------------------------------------------------------
STEP 5 — Flash karna
--------------------------------------------------------------
  1. ESP ko USB se computer se connect karo.
  2. Tools -> Port me sahi COM port select karo.
  3. Upload button daba do.
  4. Serial Monitor (115200 baud) khol ke WiFi/MQTT connect hote
     dekh sakte ho. Onboard LED bhi tab tak blink karta rahega jab
     tak WiFi+MQTT dono connect na ho jaayein, phir solid ON ho
     jayega.

--------------------------------------------------------------
STEP 6 — IR Remote sikhaana (sirf Fan Board)
--------------------------------------------------------------
App ke Remote tab me jaake:
  1. AC ya TV remote choose karo (dono tabs upar hain).
  2. Kisi bhi button ko LONG-PRESS karo — Fan Board 15 second ke
     liye "Learn Mode" me chala jaata hai.
  3. Us 15 second ke andar apna ASLI AC/TV remote uthaao, seedha
     Fan Board ke IR receiver (D5 module) ki taraf point karo, aur
     wahi corresponding button dabao (jaise "Power" seekha rahe ho
     to remote ka Power button dabao).
  4. App me "Learned" confirmation aayega. Ab us button ko tap
     karne se wahi IR code bhej diya jayega — AC/TV usse react
     karega jaise asli remote se kiya ho.
  5. Har button alag se seekhna padega (Power, Temp+, Vol+, etc.) —
     ek baar seekh liya to flash memory (LittleFS) me save rehta
     hai, dobara seekhne ki zaroorat nahi jab tak chaho na badlo.

--------------------------------------------------------------
WIFI SETUP — multiple networks, aur password badalne pe reflash
nahi karna padega
--------------------------------------------------------------
Dono boards ab apni WiFi networks flash (LittleFS) me save rakhte hain,
config.h me nahi — isliye router ka password badalne ya naya router
lagane pe firmware dobara upload karne ki ZAROORAT NAHI. Ye kaam do
tareeke se hota hai, jab bhi chaho:

  1) APP SE (jab board pehle se kisi WiFi/internet se online hai):
     Board ke NodeDetail page pe (jahan uske switches dikhte hain) WiFi
     icon pe tap karo -> "WiFi Settings" screen khulegi. Yahan ek saath
     MULTIPLE network add kar sakte ho (ghar ka router, ek backup
     router, phone hotspot, jo bhi) — SSID + password har ek ke liye.
     "Save & send to board" dabate hi puri list MQTT se board ko chali
     jaati hai, board use flash me save kar leta hai aur agli baar
     WiFi drop/reconnect hote hi (ya restart pe) in sabme se jo bhi
     range me available ho usse khud judd jaata hai — koi ek network
     na mile to doosra try karega, apne aap.
     Isi screen se kisi network ka PASSWORD BADALNA bhi ho to bas wahi
     entry edit karke dobara "Save & send to board" dabao.

  2) SETUP HOTSPOT SE (jab board KISI bhi saved network se connect na
     ho paaye — jaise bilkul pehli baar, ya sab saved networks ek saath
     badal/band ho jaayein): board khud "SmartHome-Setup-XXXX" naam se
     apna WiFi hotspot chalu kar deta hai (koi password nahi, open
     network — sirf local setup ke liye). Kisi bhi phone/laptop se us
     hotspot se connect karo, browser me 192.168.4.1 kholo (ya zyaadatar
     phones pe ek "Sign in to network" popup khud aa jaayega) — ek
     simple form khulega jisme naya WiFi naam/password daal ke "Save &
     Connect" dabao. Board 3 second me reboot hoke usi network se judne
     ki koshish karega. App ki zaroorat nahi is step ke liye.

  Board har baar boot pe (aur agar beech me WiFi disconnect ho jaaye
  to bhi) pehle apni saari saved networks try karta hai; sirf tabhi
  setup hotspot khulta hai jab ek bhi na mile. Setup hotspot 3 minute
  me apne aap band ho jaata hai agar koi setup na kare, phir se saved
  networks retry karne lag jaata hai — board hamesha ke liye "setup
  mode" me atka nahi rehta.

  Required libraries — is feature ke liye koi EXTRA library install
  nahi karni: ESP8266WebServer, DNSServer, aur LittleFS teeno ESP8266
  board package ke saath hi bundled aate hain (Step 1 me jo install
  kiya wahi kaafi hai).

--------------------------------------------------------------
NIGHT MODE — simple AC sleep cycle + Switch Curfew (DONE, firmware me
bhi ab implement ho chuka hai — dono .ino files updated)
--------------------------------------------------------------
NodeDetail > Night Mode screen (app) me do cheezein hain, dono ab
firmware me bhi kaam karti hain:

  A) AC SLEEP CYCLE — simple ON (min) / OFF (min) cycle jab tak AC
     Sleep Mode on hai (e.g. 15 min on / 15 min off). Chaho to
     "AUTO-OFF AFTER" me kuch ghanton baad poora cycle band karwa
     sakte ho (0 = koi limit nahi), aur chaho to "ONLY DURING SPECIFIC
     HOURS" se sirf ek clock-window (jaise raat 5PM-5AM) ke andar hi
     cycle chalao — baaki time AC fully ON rahega. Sab optional hai;
     bas onMin/offMin bhar ke seedha "Save" bhi kar sakte ho.

  B) SWITCH CURFEW — is board ke kisi bhi switch (jaise AC, dono
     socket) ko chuno jo raat ko ek fixed time (default demo: 12:00
     AM) pe khud-ba-khud OFF ho jaaye, permanently, jab tak manually
     wapas on na karo. Jo switch (jaise TV) tick NAHI kiya, wo bilkul
     untouched rahega — usko curfew kabhi off nahi karega.

Dono cheezein sirf app ke Night Mode screen se control hoti hain, koi
firmware reflash nahi chahiye future me values badalne ke liye — bas
naya "Save Night Mode" dabao, MQTT retained message se seedha board
tak pahunch jaata hai.

Neeche wala MQTT contract detail hai (sirf reference ke liye — agar
tumhe khud se firmware customize karna ho):

  1) SCHEDULE ab per-din nahi, chune hue din(s) pe chalta hai:
       <prefix>/<node>/<ch>/schedule/set   (retained)
       OLD: "HH:MM"  (matlab: har din)
       NEW: {"time":"HH:MM","days":[0,1,2,3,4,5,6]}   (0=Sun..6=Sat),
            ya "" khali string schedule cancel karne ke liye.
       Firmware ko: JSON parse karke sirf un dino pe hi off karna hai
       jo "days" array me hain (poore 7 din ho to purane jaisa behavior).

  2) SLEEP MODE ka apna CONFIG topic (cycle minutes + window + max
     runtime) ab on/off se ALAG hai:
       <prefix>/<node>/<ch>/sleep/config/set   (retained)
       JSON: {"onMin":15,"offMin":15,"start":"HH:MM","end":"HH:MM","maxHours":6}
       - onMin/offMin  -> abhi firmware me hardcoded 15/15 hai, isse
                          padhna hoga instead.
       - start/end     -> khali "" = poore time cycle chale (jaisa
                          abhi hai); bhara ho to sirf us clock window
                          ke andar hi cycle chale, baaki time AC fully
                          ON rahe (sleep se untouched).
       - maxHours       -> 0 = koi limit nahi; >0 ho to Sleep Mode ON
                          hone ke us kitne ghante baad khud OFF (poora
                          cycle band) ho jaye, jab tak dubara manually
                          on na kiya jaye.
       (<prefix>/<node>/<ch>/sleep/set "1"/"0" — turning the whole
       cycle on/off — waisa hi rehta hai, koi change nahi.)

  3) SWITCH CURFEW — bilkul naya feature, per-BOARD (per-appliance nahi):
       <prefix>/<node>/curfew/set   (retained)
       JSON: {"time":"HH:MM","channels":["relay2","relay3"]}
       Firmware ko: har din us "time" pe, listed channels ko FORCE OFF
       karna hai (jaise schedule ki tarah — ek baar off, phir manually
       on karne tak off hi rahe). Channels list app se aata hai — user
       ne NodeDetail > Night Mode screen me jo switches select kiye
       hain wahi is list me honge.

Teeno hi retained JSON topics hain (QoS 1) — ArduinoJson jo already
library list me hai (Step 2) isse parse karne ke liye kaafi hai.

================================================================
 Doubt ho to bata dena.
================================================================
