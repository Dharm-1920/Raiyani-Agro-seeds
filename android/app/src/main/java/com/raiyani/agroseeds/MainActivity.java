package com.raiyani.agroseeds;

import android.app.Activity;
import android.content.Intent;
import android.graphics.Bitmap;
import android.net.Uri;
import android.content.pm.PackageManager;
import android.os.Build;
import android.os.Bundle;
import android.view.View;
import android.webkit.CookieManager;
import android.webkit.GeolocationPermissions;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    static final String SHOP_URL = "https://raiyaniagroseeds.onrender.com/";
    private static final String SHOP_HOST = "raiyaniagroseeds.onrender.com";
    private static final String KEY_GOOGLE_VERIFIER = "google_verifier";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
    private static final int LOCATION_PERMISSION_REQUEST = 1003;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;
    private GeolocationPermissions.Callback locationCallback;
    private String locationOrigin;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        webView = new WebView(this);
        setContentView(webView);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setAllowFileAccess(false);
        settings.setAllowContentAccess(true);
        settings.setBuiltInZoomControls(false);
        settings.setDisplayZoomControls(false);
        settings.setGeolocationEnabled(true);
        settings.setUserAgentString(settings.getUserAgentString() + " RaiyaniAgroSeedsApp/" + BuildConfig.VERSION_NAME);

        CookieManager.getInstance().setAcceptCookie(true);
        CookieManager.getInstance().setAcceptThirdPartyCookies(webView, true);

        // Lets the website tell the app which language to use for phone notifications.
        webView.addJavascriptInterface(new Object() {
            @JavascriptInterface
            public void setLanguage(String language) {
                AppNotifications.saveLanguage(getApplicationContext(), language);
            }
        }, "RaiyaniApp");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onPageFinished(WebView view, String url) {
                if (url != null && url.startsWith(SHOP_URL)) syncSession(true);
            }

            // The website signs in and out without full page loads, so also check on in-app page changes.
            @Override
            public void doUpdateVisitedHistory(WebView view, String url, boolean isReload) {
                if (url != null && url.startsWith(SHOP_URL)) syncSession(true);
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
                // Google blocks sign-in inside apps, so "Continue with Google" opens the phone's browser.
                if (SHOP_HOST.equals(uri.getHost()) && "/api/auth/google/start".equals(uri.getPath())) {
                    openGoogleSignIn(uri);
                    return true;
                }
                if ("http".equalsIgnoreCase(scheme) || "https".equalsIgnoreCase(scheme)) {
                    return false;
                }
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                }
                return true;
            }
        });
        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(WebView view, ValueCallback<Uri[]> callback,
                    FileChooserParams params) {
                if (filePathCallback != null) filePathCallback.onReceiveValue(null);
                filePathCallback = callback;
                try {
                    Intent intent = params.createIntent();
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception error) {
                    filePathCallback = null;
                    return false;
                }
                return true;
            }

            // "Use my current location" on the address form: only the shop website may ask,
            // and Android shows its own permission dialog the first time.
            @Override
            public void onGeolocationPermissionsShowPrompt(String origin, GeolocationPermissions.Callback callback) {
                Uri uri = Uri.parse(origin);
                if (!SHOP_HOST.equals(uri.getHost()) || !"https".equalsIgnoreCase(uri.getScheme())) {
                    callback.invoke(origin, false, false);
                    return;
                }
                if (hasLocationPermission()) {
                    callback.invoke(origin, true, false);
                    return;
                }
                if (locationCallback != null) locationCallback.invoke(locationOrigin, false, false);
                locationCallback = callback;
                locationOrigin = origin;
                requestPermissions(new String[] { "android.permission.ACCESS_FINE_LOCATION", "android.permission.ACCESS_COARSE_LOCATION" }, LOCATION_PERMISSION_REQUEST);
            }
        });
        webView.setBackgroundColor(0xFFF7F5EF);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.loadUrl(urlFor(getIntent()));
    }

    /** Opens Google sign-in in a browser tab, with a secret only this app can use to finish signing in. */
    private void openGoogleSignIn(Uri start) {
        try {
            byte[] secret = new byte[32];
            new java.security.SecureRandom().nextBytes(secret);
            int flags = android.util.Base64.URL_SAFE | android.util.Base64.NO_WRAP | android.util.Base64.NO_PADDING;
            String verifier = android.util.Base64.encodeToString(secret, flags);
            String challenge = android.util.Base64.encodeToString(java.security.MessageDigest.getInstance("SHA-256").digest(verifier.getBytes("US-ASCII")), flags);
            AppNotifications.prefs(this).edit().putString(KEY_GOOGLE_VERIFIER, verifier).apply();
            Uri url = start.buildUpon().appendQueryParameter("app_challenge", challenge).build();
            new androidx.browser.customtabs.CustomTabsIntent.Builder().setShowTitle(true).build().launchUrl(this, url);
        } catch (Exception error) {
            try { startActivity(new Intent(Intent.ACTION_VIEW, start)); } catch (Exception ignored) { }
        }
    }

    /** Opens the page a tapped notification points to, finishes a Google sign-in, otherwise the shop home. */
    private String urlFor(Intent intent) {
        Uri data = intent == null ? null : intent.getData();
        if (data != null && "raiyaniagroseeds".equals(data.getScheme()) && "auth".equals(data.getHost())) {
            String verifier = AppNotifications.prefs(this).getString(KEY_GOOGLE_VERIFIER, null);
            AppNotifications.prefs(this).edit().remove(KEY_GOOGLE_VERIFIER).apply();
            String code = data.getQueryParameter("code");
            if (code == null || verifier == null) {
                String error = data.getQueryParameter("error");
                return SHOP_URL + "login?authError=" + (error != null && error.matches("[a-z_]+") ? error : "google_failed");
            }
            String next = data.getQueryParameter("next");
            return Uri.parse(SHOP_URL + "api/auth/app-login").buildUpon()
                    .appendQueryParameter("code", code)
                    .appendQueryParameter("verifier", verifier)
                    .appendQueryParameter("next", next != null ? next : "/home")
                    .build().toString();
        }
        String link = intent == null ? null : intent.getStringExtra(AppNotifications.EXTRA_LINK);
        if (link != null && link.startsWith("/") && !link.startsWith("//")) return SHOP_URL + link.substring(1);
        return SHOP_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.hasExtra(AppNotifications.EXTRA_LINK) || intent.getData() != null) webView.loadUrl(urlFor(intent));
    }

    @Override
    protected void onResume() {
        super.onResume();
        AppNotifications.appVisible = true;
    }

    @Override
    protected void onPause() {
        AppNotifications.appVisible = false;
        CookieManager.getInstance().flush();
        syncSession(false);
        super.onPause();
    }

    /** Starts phone notifications for the signed-in account, or stops them after sign-out. */
    private void syncSession(boolean canAskPermission) {
        AppNotifications.saveSession(getApplicationContext(), CookieManager.getInstance().getCookie(SHOP_URL));
        if (AppNotifications.hasSession(getApplicationContext())) {
            NotificationCheckService.schedule(getApplicationContext());
            registerForInstantNotifications();
            if (canAskPermission) askForNotificationPermission();
        } else {
            NotificationCheckService.cancel(getApplicationContext());
        }
    }

    /** Only does something once Firebase is configured (google-services.json added to the app). */
    private void registerForInstantNotifications() {
        if (!BuildConfig.FIREBASE) return;
        try {
            com.google.firebase.messaging.FirebaseMessaging.getInstance().getToken()
                    .addOnSuccessListener(token -> AppNotifications.registerPushToken(getApplicationContext(), token));
        } catch (Exception ignored) {
            // Firebase not available on this phone: the 15-minute check still works.
        }
    }

    private void askForNotificationPermission() {
        if (Build.VERSION.SDK_INT < 33) return;
        if (checkSelfPermission("android.permission.POST_NOTIFICATIONS") == PackageManager.PERMISSION_GRANTED) return;
        if (AppNotifications.prefs(this).getBoolean("permission_asked", false)) return;
        AppNotifications.prefs(this).edit().putBoolean("permission_asked", true).apply();
        requestPermissions(new String[] { "android.permission.POST_NOTIFICATIONS" }, NOTIFICATION_PERMISSION_REQUEST);
    }

    private boolean hasLocationPermission() {
        return checkSelfPermission("android.permission.ACCESS_FINE_LOCATION") == PackageManager.PERMISSION_GRANTED
                || checkSelfPermission("android.permission.ACCESS_COARSE_LOCATION") == PackageManager.PERMISSION_GRANTED;
    }

    @Override
    public void onRequestPermissionsResult(int requestCode, String[] permissions, int[] grantResults) {
        super.onRequestPermissionsResult(requestCode, permissions, grantResults);
        if (requestCode != LOCATION_PERMISSION_REQUEST || locationCallback == null) return;
        // Not retained, so the website's error message appears if the customer denies access.
        locationCallback.invoke(locationOrigin, hasLocationPermission(), false);
        locationCallback = null;
        locationOrigin = null;
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        super.onActivityResult(requestCode, resultCode, data);
        if (requestCode != FILE_CHOOSER_REQUEST || filePathCallback == null) return;
        Uri[] results = WebChromeClient.FileChooserParams.parseResult(resultCode, data);
        filePathCallback.onReceiveValue(results);
        filePathCallback = null;
    }

    @Override
    public void onBackPressed() {
        if (webView.canGoBack()) webView.goBack();
        else super.onBackPressed();
    }
}
