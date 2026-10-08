# SealHUD

**SealHUD** is a modern and advanced web-based HUD for **RaceRoom Racing Experience**.

Originally inspired by the OtterHud project, SealHUD is now a fully independent project with its own identity, architecture, and long-term vision, focused on stability, customization, and continuous evolution.

---

## 🧩 About the Project

SealHUD is an actively maintained project that delivers a modern HUD experience for the RaceRoom community, featuring:

- Redesigned and modernized widgets  
- Improved telemetry integration and data accuracy  
- Compatibility with the latest RaceRoom versions  
- Ongoing maintenance and feature improvements by the SealHUD Team  

The goal is to provide a reliable, flexible, and future-proof HUD for sim racers.<br>

---

## 🚀 How to Use

1. In your **Steam Library**, right-click on *RaceRoom Racing Experience* → **Properties** → **Launch Options**  
2. Add the following parameter: -webHudUrl=https://sealhud.github.io/
3. Make sure your **CrewChief** or **dash.exe** is updated to the latest version (only one of the two is required):  
👉 [Download CrewChief](https://thecrewchief.org/forumdisplay.php?28-Download-and-Links)<br>
👉 [Download dash.zip (latest)](https://sealhud.github.io/dash.zip)

**VERY IMPORTANT:**<br>
RaceRoom's shared memory requires local TCP port 8070 to share data. Certain third-party services (such as Razer Haptic) use this port, causing a conflict that prevents SealHUD from working. Check if TCP port 8070 is currently in use on your computer (using Windows Resource Monitor / resmon.exe). If it is, you can either disable the service using Windows Services (services.msc) or change the communication port used with RaceRoom, as described in this post: [SealHUD Forum Thread - change WebSocket Port on CrewChief](https://forum.kw-studios.com/index.php?threads/sealhud-webhud.20675/page-21#post-261276)

---

## 💬 Twitch Chat

SealHUD can show the live chat of a Twitch channel, plus its viewer count, right on your HUD. No Twitch login is needed.

1. Open the SealHUD **Settings** and enable the **Twitch Chat** widget.
2. Tick **Change Twitch Channel**, click the text field, type the channel name (e.g. `yourchannel`, without `twitch.tv/`) and press **Enter**.
3. Drag the chat where you want it. Use the mouse wheel or the **−/+** buttons (shown on hover) to make it smaller or bigger.

The channel is shared by all three layouts. Messages from common bots (Nightbot, StreamElements, …) are hidden by default; use **Edit Bot List** to change which accounts are hidden.

### Twitch viewer count proxy

The optional backend at `http://localhost:8334/api/twitch/viewers?channel=CHANNEL` reads the viewer count from Twitch Helix. It returns `{"channel":"CHANNEL","viewer_count":N}`; offline channels return zero. The proxy obtains an app access token with Twitch's client credentials flow and refreshes it automatically before expiry. No refresh token needed.

Create a Twitch application, copy `.env.example` to `.env`, and set `TWITCH_CLIENT_ID` and `TWITCH_CLIENT_SECRET`. Keep `.env` private and run `docker compose up --build twitch-proxy`. The credentials stay in the backend container and never go to the HUD. `/health` reports service health; `/api/twitch/viewers` returns a clear error if credentials are missing or Twitch is unavailable.

---

## 📦 Building Artifacts

Build the production files with Docker (no local Node.js needed):

```bash
make artifacts
```

The static files are written to `.artifacts/`. Copy its contents to any HTTP server and point RaceRoom at it with `-webHudUrl=http://<server>/`. Run `make clean-artifacts` to empty the folder.

---

## 🤝 Contributing

Contributions are welcome!  
If you wish to collaborate with the development or maintenance of SealHUD, feel free to open issues or pull requests.  
Every improvement helps the community.

🔗 Special thanks to [CORSFIX](https://www.corsfix.com) for providing a reliable CORS proxy service.

---

## 💬 Discussion & Updates

You can follow news, updates, and discussions about SealHUD here:

🔗 [KW Studios Forum Thread](https://forum.kw-studios.com/index.php?threads/sealhud-webhud.20675/)

---

## ⚖️ License & Credits

> **Note:** All code in this project is licensed under the [MIT License](LICENSE).

© 2026 **Diego Junges** and SealHUD contributors.

---

## ☕ Support the Project

If you enjoy using SealHUD and would like to support continued development, donations are greatly appreciated.  
Your support helps maintain the project and fund future improvements.

🔗 [PayPal Donation Link](https://www.paypal.com/donate/?hosted_button_id=85SPZAJT797MS)

---

### Drive Safe,  
**SealHUD Team**
