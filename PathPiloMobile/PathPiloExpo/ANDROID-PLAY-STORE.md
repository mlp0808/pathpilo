# Put PathPilo on Android (simple guide)

You already did the hard part: **Google Play developer account** ✓

Think of it in three boxes:

| Box | What it is | Where it lives |
|-----|------------|----------------|
| **Your server** | Website + database + API | Hetzner (app.pathpilo.com) |
| **The phone app** | What workers install | Built on your PC, uploaded to Google |
| **Google Play** | The shop that lists your app | play.google.com/console |

The phone app is **not** copied to the server. It only **phones home** to `https://app.pathpilo.com` when someone opens it.

---

## Step 0 — Quick check (2 minutes)

On your phone or PC browser, open:

**https://app.pathpilo.com**

- If you can log in → server is ready for the app.
- If it errors or is blank → fix the server first (see `PATHPILO-LIVE-DEPLOYMENT.md` in the project root). No point uploading an app that cannot reach your data.

---

## Step 1 — One-time setup on your Windows PC

Open **PowerShell** and run these **once** (copy one block at a time).

### 1a) Go to the app folder

```powershell
cd "C:\Users\kylli\Desktop\CODE EXPORT\Vevago\Vevago\PathPiloMobile\PathPiloExpo"
npm install
```

### 1b) Free Expo account (builds the Android file in the cloud)

1. Go to https://expo.dev and sign up (free).
2. In PowerShell:

```powershell
npx expo login
npm install -g eas-cli
eas login
```

Use the same email/password as expo.dev.

---

## Step 2 — Build the Android file Google wants

This takes about 10–20 minutes. Expo’s computers do the work; you wait for a link.

```powershell
cd "C:\Users\kylli\Desktop\CODE EXPORT\Vevago\Vevago\PathPiloMobile\PathPiloExpo"
eas build --platform android --profile production
```

- Say **Yes** if it asks to create a project on Expo.
- Say **Yes** if it asks to generate a signing key (normal for first time).
- When finished, open the link it prints and **download the `.aab` file** (that is your app package).

The build is already set to talk to **https://app.pathpilo.com** — you do not need to edit code for that.

---

## Step 3 — Google Play Console (click path)

1. Open https://play.google.com/console  
2. **Create app** → name: **PathPilo** (or your public name) → fill the short forms → Create.  
3. Left menu: **Testing** → **Internal testing** → **Create new release**.  
4. **Upload** the `.aab` file you downloaded.  
5. Add **Release notes** (e.g. “First version”).  
6. **Save** → **Review release** → **Start rollout to Internal testing**.  
7. **Testers** tab → add your Gmail address → save.  
8. On your Android phone: open the **opt-in link** Google shows → install from Play Store.

If login and jobs work on the test install, you can later promote the same release to **Production** (public).

---

## Step 4 — Stuff Google will ask for (not code)

Before **Production**, you’ll need in Play Console:

| Item | What to do |
|------|------------|
| **Store listing** | Short description, a few screenshots from the app |
| **Privacy policy** | A public URL (e.g. a page on pathpilo.com) |
| **App icon** | Already in `assets/icon.png` — upload the same look |
| **Data safety** | Form: “we collect account info for login” etc. |
| **Content rating** | Answer the questionnaire (usually quick for business apps) |

---

## Testing at home (optional)

Only if you want the app on your phone while the server is still on your PC:

1. Copy `.env.example` to `.env` in this folder.  
2. Change the IP to your PC’s Wi‑Fi address (`ipconfig` in PowerShell).  
3. Run `npx expo start` and scan the QR code.

Play Store builds **ignore** `.env` and always use **app.pathpilo.com**.

---

## When you release version 2

1. In `app.json`, bump `"version": "1.0.1"` and `"versionCode": 2` (must go up every upload).  
2. Run `eas build --platform android --profile production` again.  
3. Upload the new `.aab` in Play Console.

---

## Stuck?

| Problem | Try this |
|---------|----------|
| Build fails | Copy the red error text; often missing `eas login` or wrong folder |
| App opens but won’t log in | Open https://app.pathpilo.com in browser — server issue |
| “Package name already used” | You already created an app with another package ID — tell dev, don’t change `com.pathpilo.app` after first upload |

Your app ID for Android: **com.pathpilo.app** (set in `app.json`).
