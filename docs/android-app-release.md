# Releasing a new Android app version

The app is signed with the shop's own release key, kept **outside this project**:

```
C:\Users\djrai\raiyani-app-signing\
    raiyani-release.keystore   <- the signing key
    keystore.properties        <- its password
```

**Back up this folder** (for example to a private Google Drive folder or a USB drive). If it is lost,
customers cannot update the app; everyone would have to uninstall and reinstall. Never put it on GitHub.

Certificate SHA-256: `29:BB:D6:74:7D:4F:E2:2B:D2:56:17:80:76:7E:59:D3:02:AC:0A:B4:A5:BC:70:D5:8B:E5:B9:14:87:BA:CE:50`

## Steps

1. In `android/app/build.gradle`, increase `versionCode` by 1 and set the new `versionName` (for example `1.2.1`).
2. Build: from `android/`, run `gradle assembleRelease` (with `ANDROID_HOME` pointing at the Android SDK).
3. Copy `android/app/build/outputs/apk/release/app-release.apk` to `client/public/raiyani-agro-seeds.apk`.
4. In `client/src/config.js`, set `LATEST_APP_VERSION` to the new version, so people with older versions see the update message.
5. Commit and push. Render deploys the website with the new download.

Versions before 1.2.0 were signed with a temporary key, so people who installed them must remove the old app once before installing 1.2.0 or newer. The update message tells them this.
