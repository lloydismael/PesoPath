# 🌿 PesoPath v1.2: Budget Tracker, Debt-Freedom Planner & Installment Tracker

PesoPath is built with plain HTML, CSS and JavaScript. There is no build step and nothing to install. All data is saved in your browser's **localStorage**.

> **Live app:** <https://lloydismael.github.io/PesoPath/> — hosted free on GitHub Pages, so it installs as a PWA on your phone.

## ▶️ Run it in VS Code
1. Extract the zip, then go to **File → Open Folder… → `pesopath`**.
2. Install the recommended **Live Server** extension.
3. Right-click `index.html` and choose **Open with Live Server**.

You can also open `index.html` directly in a browser, or run `npm start`. Run `npm test` for the unit tests. `npm run test:ui` runs the browser UI checks with isolated demo data; it needs Node 22+ and Chrome or Edge (set `CHROME_PATH` if the browser is elsewhere).
When updating cached web assets, keep the asset versions in `index.html` and the service-worker `VERSION` in sync; the tests check this.

Tap the month in the header to choose a month and year, or use the arrows to move one month at a time. The picker also has a **This month** shortcut.
On iPhone, use the eye icon to hide or show amounts and the moon/sun icon to switch appearance.

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

The test build [`PesoPath-calendar-debug.apk`](PesoPath-calendar-debug.apk) is in the project root — copy it to the phone (USB, Drive, or `adb`) and tap it. You'll need to allow *Install unknown apps* for that source. It uses the same local debug signing certificate as the earlier `PesoPath-debug.apk`; an update to a differently signed installation will be rejected.

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
1. Reuse the existing release keystore and alias. Only for a first release, create a key with `keytool -genkey -v -keystore pesopath.jks -keyalg RSA -keysize 2048 -validity 10000 -alias pesopath` and keep it safe.
2. `npm run android:sync`, then `cd android && gradlew.bat assembleRelease`
3. Sign the output with `apksigner` (or add `signingConfigs` in `android/app/build.gradle`).

The app id is `ph.pesopath.app` — change it in `capacitor.config.json` before publishing.

---

### Option B — Native iOS app
The Xcode project is already generated in [`ios/`](ios) (bundle id `ph.pesopath.app`, iOS 13+, branded icon + splash, shared `App` scheme). iOS builds are fundamentally different from Android:

- Xcode and the iOS SDK **only run on macOS** — there is no Windows toolchain.
- A device install must be **code-signed** with an Apple ID (free signing = the app expires every 7 days, max 3 apps; paid Apple Developer = 1 year).
- Dark mode uses an OLED-black background on iOS, Android, and web. **Settings** provides appearance and privacy controls on every platform; iPhone also has them in its header. Privacy hides summary and chart amounts, not editable fields, exported data, or the underlying local storage.

The local [`PesoPath-calendar-unsigned.ipa`](ios-build/PesoPath-calendar-unsigned.ipa) repackages updated web assets into the earlier unsigned native build; it is not a fresh Xcode build. Re-run the iOS workflow for later native project changes. Keep the same Apple ID and bundle ID when updating, and export a backup first; the sideloading tool can still change the signing identity or App ID.

Pick whichever matches your situation:

#### B1 — No Mac: build in the cloud, sign on Windows (free)
1. Push this folder to a GitHub repo (private is fine).
2. **Actions → Build iOS app (unsigned IPA) → Run workflow**. The workflow at [.github/workflows/ios-build.yml](.github/workflows/ios-build.yml) runs on a `macos-latest` runner, produces `PesoPath-unsigned.ipa`, and uploads it as an artifact.
3. Download the artifact, then install **Sideloadly** (<https://sideloadly.io>) or **AltStore** on your Windows PC.
4. Connect the iPhone, drag the IPA into Sideloadly, enter your Apple ID, press **Start**. iOS will ask you to trust the developer in **Settings → General → VPN & Device Management**.
   *Free Apple IDs re-sign every 7 days; a paid developer account gives 1 year.*

> The IPA is unsigned on purpose — Apple's signing certificates can't be stored in a public workflow without secrets. If you have a paid account, add `IOS_CERTIFICATE_P12`, `IOS_CERTIFICATE_PASSWORD`, `IOS_PROVISIONING_PROFILE`, `APPLE_TEAM_ID` as repo secrets and swap the last step for `xcodebuild -exportArchive`.

#### Sideloading the unsigned IPA from Windows (Sideloadly)
The `.ipa` is not signed, so Windows Explorer / Apple Configurator cannot install it — it must be re-signed with your own Apple ID first. Sideloadly does that locally.

0. **Prerequisites:** [Sideloadly](https://sideloadly.io) plus *iTunes* and *iCloud* installed from <https://apple.com/itunes> and <https://support.apple.com/106240> (not the Microsoft Store versions — Sideloadly needs Apple's USB drivers / `AppleMobileDeviceService`).
1. **Apple account:** enter your credentials directly in Sideloadly when prompted; do not share them in chat. According to Sideloadly, app-specific passwords work only with a paid Apple Developer account and anisette disabled.
2. Connect the iPhone by USB → tap **Trust This Computer** → enter the passcode. Sideloadly should list the device with its iOS version.
3. Drag `PesoPath-calendar-unsigned.ipa` into the **IPA** box (or use the IPA downloaded from your own workflow).
4. Type your Apple ID into the **Apple ID** field, then **Start**. Sideloadly generates a signing certificate, signs, and installs (1–3 min).
5. **Trust the developer** on the phone: *Settings → General → VPN & Device Management → <your Apple ID> → Trust*.
6. **iOS 16+ only:** enable *Settings → Privacy & Security → Developer Mode → On*, then restart the iPhone and confirm.

Limits with a **free** Apple ID: the app works for **7 days**, max **3 sideloaded apps**, and you re-run Sideloadly to refresh. A paid Apple Developer account extends that to 1 year. Before updating, export a JSON backup and verify that it can be restored; reinstalling or changing the signing identity can remove access to local data.

Alternative tools: **AltStore/AltServer** (auto-refreshes over Wi-Fi while the PC is on), **SideStore** (refresh on-device), **ESign** (needs a certificate).

Troubleshooting:
| Symptom | Fix |
|---|---|
| "Unable to install … maximum number of apps" | Delete another sideloaded app (free ID limit is 3) |
| App installs but won't open | Trust the developer in step 5; on iOS 16+ check Developer Mode |
| "Could not find device" | Reinstall Apple's iTunes + iCloud, restart `AppleMobileDeviceService` |
| Stops working after ~7 days | Back up your data if possible, then re-run Sideloadly with the same Apple ID |
| `guru meditation` / anisette error | Consult Sideloadly's troubleshooting guidance for the specific error |

#### B2 — You have access to a Mac
```bash
npm install
npm run ios:sync          # copy web assets + pod install
npm run ios:open          # opens ios/App/App.xcworkspace in Xcode
```
In Xcode: select the **App** target → *Signing & Capabilities* → choose your Team (add your Apple ID under *Xcode → Settings → Accounts* if it's not listed) → pick your iPhone as the destination → **Run** (⌘R).

Requirements on that Mac: Xcode 15+, CocoaPods (`brew install cocoapods`), Node 20+.

CLI equivalent (device must be trusted + connected):
```bash
cd ios/App && pod install && xcodebuild -workspace App.xcworkspace -scheme App \
  -configuration Debug -destination 'generic/platform=iOS' -allowProvisioningUpdates build
```

#### B3 — TestFlight / App Store
Needs a paid Apple Developer account ($99/yr). Archive in Xcode (*Product → Archive → Distribute App → App Store Connect*), then add testers in App Store Connect → TestFlight. Bundle id must be registered and the icon must be opaque (already is).

#### B4 — Fastest check on an iPhone (no signing at all)
Use the PWA route below — Safari → *Share* → *Add to Home Screen*. Same code, full-screen, works offline, no Apple ID.

---

### Option C — PWA (works on both, no build)
Installable web app: own icon, full-screen, offline. Phones only offer *Install* over **`https://`** (or `localhost`) — `http://192.168.x.x:5173` browses fine but won't install.

**Host it (free):** drag the folder onto <https://app.netlify.com/drop>, or push to GitHub and enable *Settings → Pages → Deploy from branch → main / (root)*. Temporarily: `npm run serve` + `npx cloudflared tunnel --url http://localhost:5173`.

- **Android (Chrome/Edge):** open the HTTPS link → **⋮** → **Install app**
- **iPhone (Safari only):** open the link → **Share** (□↑) → **Add to Home Screen**

### Updating later
Re-upload the files (or push to the repo) and reopen the app; the service worker fetches the new version on next launch. Clearing site data also deletes the app's locally stored finances; export a backup first if you need to clear it.

Files that make the PWA work: `manifest.json` (name, icons, standalone display) · `sw.js` (offline cache of the app shell) · `icons/` (192/512/maskable + Apple touch icon) · the `manifest`/`theme-color`/`apple-*` tags in `index.html`.

### Azure Static Web Apps deployment
The resource-group-scoped template [`infra/main.bicep`](infra/main.bicep) defines a new Free Static Web App in East Asia. Deploy it to the intended subscription and resource group after reviewing the Azure deployment and costs. It does not modify the existing web apps. The production workflow [`azure-static-web-apps.yml`](.github/workflows/azure-static-web-apps.yml) runs from `main` or by manual dispatch from `main`.

To create the resource after approval, supply the intended subscription and resource group:

```powershell
az deployment group create --subscription '<subscription-id>' --resource-group '<resource-group>' --template-file infra\main.bicep
```

In the GitHub repository's **Settings → Secrets and variables → Actions**, configure these repository secrets:

| Secret | Value |
|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | Deployment token for the new Static Web App |
| `ANDROID_KEYSTORE_BASE64` | Base64 encoding of the existing Android release keystore |
| `ANDROID_KEYSTORE_PASSWORD` | Keystore password |
| `ANDROID_KEY_ALIAS` | Alias of the existing release key |
| `ANDROID_KEY_PASSWORD` | Password for that key |

For example, the keystore can be sent directly to GitHub from PowerShell without putting it in the repository or chat:

```powershell
[Convert]::ToBase64String([IO.File]::ReadAllBytes('C:\path\to\release.jks')) | gh secret set ANDROID_KEYSTORE_BASE64
```

Configure the other secrets in GitHub without sharing their values. The workflow tests the site, builds and verifies a release APK signed with that existing key, calls the unsigned iOS build, and deploys only the staged web assets and packages. It fails rather than using a debug key or deploying missing packages. Standard GitHub-hosted runner minutes are free for public repositories; artifact storage or private-repository usage may be billed. The public APK and unsigned IPA are offered to Android and iOS browsers respectively; the IPA must be signed before sideloading. Downloads are not available offline. The existing manually triggered iOS workflow remains available for standalone IPA builds.

After creating the Azure resource, find its deployment token in the Static Web App's **Manage deployment token** page and enter it directly as the GitHub secret; do not commit or paste it into chat.

Export a JSON backup before switching to the Azure origin or replacing an installation. Web, PWA, and native app storage are separate; Android also rejects an update signed with a different key, potentially requiring an uninstall and loss of local app data.

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
ios/                # Generated Capacitor iOS project (Xcode/CocoaPods)
.github/workflows/  # CI: macOS job that builds an unsigned iOS IPA
```
