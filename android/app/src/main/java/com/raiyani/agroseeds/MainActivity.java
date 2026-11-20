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
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;

public class MainActivity extends Activity {
    static final String SHOP_URL = "https://raiyaniagroseeds.onrender.com/";
    private static final int FILE_CHOOSER_REQUEST = 1001;
    private static final int NOTIFICATION_PERMISSION_REQUEST = 1002;
    private WebView webView;
    private ValueCallback<Uri[]> filePathCallback;

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
                if (url == null || !url.startsWith(SHOP_URL)) return;
                AppNotifications.saveSession(getApplicationContext(), CookieManager.getInstance().getCookie(SHOP_URL));
                if (AppNotifications.hasSession(getApplicationContext())) {
                    NotificationCheckService.schedule(getApplicationContext());
                    askForNotificationPermission();
                    registerForInstantNotifications();
                } else {
                    NotificationCheckService.cancel(getApplicationContext());
                }
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                String scheme = uri.getScheme();
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
        });
        webView.setBackgroundColor(0xFFF7F5EF);
        webView.setOverScrollMode(View.OVER_SCROLL_NEVER);
        webView.loadUrl(urlFor(getIntent()));
    }

    /** Opens the page a tapped notification points to, otherwise the shop home. */
    private static String urlFor(Intent intent) {
        String link = intent == null ? null : intent.getStringExtra(AppNotifications.EXTRA_LINK);
        if (link != null && link.startsWith("/") && !link.startsWith("//")) return SHOP_URL + link.substring(1);
        return SHOP_URL;
    }

    @Override
    protected void onNewIntent(Intent intent) {
        super.onNewIntent(intent);
        setIntent(intent);
        if (intent.hasExtra(AppNotifications.EXTRA_LINK)) webView.loadUrl(urlFor(intent));
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
        super.onPause();
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
