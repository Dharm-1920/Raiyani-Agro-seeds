import { useState } from 'react';
import { LATEST_APP_VERSION, FIRST_RELEASE_SIGNED_VERSION } from './config';
import { tr } from './language.jsx';

/** Version of the Android app this page is running in, or null in a normal browser. */
export function appVersion(userAgent = typeof navigator === 'undefined' ? '' : navigator.userAgent) {
  const match = /RaiyaniAgroSeedsApp\/(\d+(?:\.\d+)*)/.exec(userAgent);
  return match ? match[1] : null;
}
export function olderThan(version, target) {
  const a = version.split('.').map(Number), b = target.split('.').map(Number);
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const x = a[i] || 0, y = b[i] || 0;
    if (x !== y) return x < y;
  }
  return false;
}

const DISMISS_KEY = 'ras-app-update-dismissed';

/** Tells people using an old Android app that a new version is available (there is no Play Store to update it). */
export default function AppUpdateBanner() {
  const version = appVersion();
  const [hidden, setHidden] = useState(() => { try { return sessionStorage.getItem(DISMISS_KEY) === LATEST_APP_VERSION; } catch { return false; } });
  if (!version || hidden || !olderThan(version, LATEST_APP_VERSION)) return null;
  const reinstall = olderThan(version, FIRST_RELEASE_SIGNED_VERSION);
  const close = () => { setHidden(true); try { sessionStorage.setItem(DISMISS_KEY, LATEST_APP_VERSION); } catch { /* Browser storage may be disabled. */ } };
  return <aside className="app-update-banner" role="status">
    <div>
      <strong>{tr('A new version of the app is available')}</strong>
      <span>{tr(reinstall
        ? 'First remove the old Raiyani Agro Seeds app from your phone, then download and install the new one. Your account and orders stay safe.'
        : 'Download it and install over the current app. Your account and orders stay safe.')}</span>
    </div>
    <a className="btn" href="/raiyani-agro-seeds.apk" download>{tr('Download update')}</a>
    <button type="button" className="app-update-close" aria-label={tr('Close')} onClick={close}>×</button>
  </aside>;
}
