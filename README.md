# 🌿 PesoPath v1.2: Budget Tracker, Debt-Freedom Planner & Installment Tracker

PesoPath is built with plain HTML, CSS and JavaScript. There is no build step and nothing to install. All data is saved in your browser's **localStorage**.

## ▶️ Run it in VS Code
1. Extract the zip, then go to **File → Open Folder… → `pesopath`**.
2. Install the recommended **Live Server** extension.
3. Right-click `index.html` and choose **Open with Live Server**.

You can also open `index.html` directly in a browser, or run `npm start`. Run `npm test` for the unit tests.

### Press F5 to run & debug
`.vscode/launch.json` is pre-configured, so you can just:

1. Open the **Run and Debug** view (`Ctrl+Shift+D`) — or press **F5** directly.
2. Pick **PesoPath (Edge)** or **PesoPath (Chrome)** from the dropdown.
3. Press **F5** (or the ▶ button).

That starts a local server on <http://localhost:5173> and opens the app in the debug browser, so breakpoints in `js/*.js` work. Stop with **Shift+F5**. To run the server alone, use **Terminal → Run Task → Start PesoPath** or `npm run serve`.

## 📱 Install on your phone (Android / iOS)
Two routes: a **native app** (real `.apk` / iOS build) or a **PWA** (fast, no store).

---

### Option A — Native Android APK
The app is wrapped with [Capacitor](https://capacitorjs.com), so it runs in a native shell: own launcher icon, splash screen, no browser UI.

A ready-to-install **`PesoPath-debug.apk`** (4.9 MB) is in the project root — copy it to the phone (USB, Drive, or `adb`) and tap it. You'll need to allow *Install unknown apps* for that source.

Rebuild it yourself:
```bash
npm install
npm run android:apk      # → android/app/build/outputs/apk/debug/app-debug.apk
npm run android:open     # optionally opens Android Studio to run/debug on a device
```
Requires JDK 17 + Android SDK build-tools 34; the build reads `ANDROID_HOME` or `android/local.properties`.

**Install over USB instead of copying the file:**
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

**Signed release build (for sharing / Play Store):**
1. `keytool -genkey -v -keystore pesopath.jks -keyalg RSA -keysize 2048 -validity 10000 -alias pesopath`
2. `npm run android:sync`, then `cd android && gradlew.bat assembleRelease`
3. Sign the output with `apksigner` (or add `signingConfigs` in `android/app/build.gradle`).

The app id is `ph.pesopath.app` — change it in `capacitor.config.json` before publishing.

---

### Option B — Test on iPhone / iPad
Capacitor's iOS target **needs macOS + Xcode**; it can't be built on Windows.

| Goal | How |
|---|---|
| **Try it on an iPhone right now** | Use the PWA route below (Safari → *Add to Home Screen*). Same code, full-screen, offline. |
| **Native iOS build** | On a Mac: `npm install && npx cap add ios && npx cap sync ios && npx cap open ios` → choose your iPhone/simulator in Xcode → Run. A free Apple ID is enough for a physical device. |
| **No Mac available** | Push to GitHub and build on a cloud macOS runner (Codemagic, GitHub Actions `macos-*`, Ionic Appflow), then distribute via TestFlight or ad-hoc. |

---

### Option C — PWA (works on both, no build)
Installable web app: own icon, full-screen, offline. Phones only offer *Install* over **`https://`** (or `localhost`) — `http://192.168.x.x:5173` browses fine but won't install.

**Host it (free):** drag the folder onto <https://app.netlify.com/drop>, or push to GitHub and enable *Settings → Pages → Deploy from branch → main / (root)*. Temporarily: `npm run serve` + `npx cloudflared tunnel --url http://localhost:5173`.

- **Android (Chrome/Edge):** open the HTTPS link → **⋮** → **Install app**
- **iPhone (Safari only):** open the link → **Share** (□↑) → **Add to Home Screen**

### Updating later
Re-upload the files (or push to the repo) and reopen the app; the service worker fetches the new version on next launch. To force a clean slate, clear the site data in the browser.

Files that make the PWA work: `manifest.json` (name, icons, standalone display) · `sw.js` (offline cache of the app shell) · `icons/` (192/512/maskable + Apple touch icon) · the `manifest`/`theme-color`/`apple-*` tags in `index.html`.

### ⚠️ Data lives on each device
Everything is stored in `localStorage`, which is per-install/per-origin. The APK, the phone's PWA and the desktop copy do **not** share data — move it with **Settings → Backup (JSON)** and restore on the other device.

## 🧭 Guided first-time setup (new in v1.2)
On first launch, a **welcome screen** asks: *Set up my own money* (recommended) or *Explore with demo data*. **Settings → Clear all** starts the same guided setup again.

**The steps, most important first:**
| # | Step | Priority | Can skip? |
|---|---|---|---|
| 1 | Tell us about you & your income (name, take-home pay, paydays) | 🚩 Required | – |
| 2 | Add where your money is (bank, e-wallet, cash) | 🚩 Required | – |
| 3 | Record your latest income ("Income" is pre-selected) | 🚩 Required | – |
| 4 | List your debts | 💳 Recommended | "I have no debts" |
| 5 | Add your installments | 💳 Recommended | ✓ |
| 6 | Add recurring bills | 💳 Recommended | ✓ |
| 7 | Create your monthly budget (✨ one-click 50/30/20 suggestion) | 🎯 Recommended | – |
| 8 | Start your emergency fund | 🎯 Recommended | ✓ |
| 9 | Pick your payoff strategy (only shown if you added debts) | 🎯 Recommended | ✓ |

**How it guides you:**
- **Spotlight:** the screen dims and the exact button to click gets a glowing outline, with a tooltip explaining why.
- **Highlighted fields:** inside each form, the fields to fill are outlined and numbered 1→N, each with a 👉 hint. They turn green with a ✓ when filled, and the Save button pulses.
- **Locks:** steps unlock in order (for example, you can't record income before adding an account). Trying to skip ahead takes you to the step you need first.
- **Auto-advance:** each finished step is detected automatically, and a card offers *Next: … Continue →*.
- **Progress:**
  - On the dashboard: a setup hero card plus the full checklist.
  - A floating **Setup guide · x/N** button opens a checklist drawer.
- **Finish screen:** shows your daily, payday and weekly routine.
- **Restart anytime:** go to **Settings → Restart guide**.

**Smart helpers:**
- **✨ Suggest my budget:** starts from your income, uses your bills as each category's minimum, sets Debt Payment to your debt minimums and Installments to your monthly amortizations, and warns you if your debts are too high. Every amount is editable, and a live check shows when "every peso has a job."
- **Bill categories:** guessed from the name (Rent → Housing, Meralco/PLDT → Utilities, Netflix → Subscriptions).
- **Empty pages:** each one has a clear call-to-action instead of showing zeros.

## Other modules
Dashboard · Transactions · Budget (category / 50-30-20 / envelope / paycheck) · Debts (Avalanche, Snowball, simulator, priority roadmap) · Installments (term-by-term bars, timeline, 12-month forecast) · Goals · Bills calendar · Reports · Privacy mode, dark mode, PIN lock, JSON/CSV backup.

## 📁 Structure
```
js/guide.js         # Setup guide: steps, priorities, spotlight, field highlights, auto-advance
js/store.js         # Data, demo seed, first-run detection, onboarding state, migration
js/installments.js  # Installment engine
js/debt.js          # Payoff engine
js/ui.js            # Forms, modal hooks, SVG charts
js/views.js         # Pages
js/app.js           # Router, actions, profile wizard, budget suggestion
manifest.json       # PWA metadata so the app can be installed on a phone
sw.js               # Service worker: offline app-shell cache
icons/              # App icons (192/512/maskable + Apple touch icon)
capacitor.config.json # Native (Android/iOS) wrapper config: appId, appName, webDir
scripts/copy-web.js # Copies the static app into dist/ for native builds
android/            # Generated Capacitor Android project (Gradle)
```
