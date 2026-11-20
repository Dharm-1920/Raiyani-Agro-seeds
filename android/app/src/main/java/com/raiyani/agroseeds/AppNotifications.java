package com.raiyani.agroseeds;

import android.app.Notification;
import android.app.NotificationChannel;
import android.app.NotificationManager;
import android.app.PendingIntent;
import android.content.Context;
import android.content.Intent;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.os.Build;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.text.SimpleDateFormat;
import java.util.Locale;
import java.util.TimeZone;

/** Fetches new shop notifications and shows them in the phone's notification bar. */
final class AppNotifications {
    static final String CHANNEL_ID = "shop_updates";
    static final String EXTRA_LINK = "com.raiyani.agroseeds.LINK";
    private static final String PREFS = "notifications";
    private static final String KEY_COOKIE = "session_cookie";
    private static final String KEY_LAST_SEEN = "last_seen";
    private static final String KEY_LANGUAGE = "language";
    private static final String KEY_SHOWN = "shown_ids";
    private static final String KEY_PUSH_REGISTERED = "push_registered";
    private static final int MAX_PER_CHECK = 5;

    /** True while the shop is open on screen; the website's bell already shows new items then. */
    static volatile boolean appVisible = false;

    private AppNotifications() {}

    static SharedPreferences prefs(Context context) {
        return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    /** Remembers the signed-in session so background checks can ask the shop for this account's notifications. */
    static void saveSession(Context context, String cookieHeader) {
        String token = null;
        if (cookieHeader != null) {
            for (String part : cookieHeader.split(";")) {
                String trimmed = part.trim();
                if (trimmed.startsWith("token=") && trimmed.length() > 6) token = trimmed;
            }
        }
        SharedPreferences prefs = prefs(context);
        SharedPreferences.Editor editor = prefs.edit();
        if (token == null) editor.remove(KEY_COOKIE).remove(KEY_LAST_SEEN);
        else {
            // A new sign-in starts from now: older notifications are already on the website's bell.
            if (!token.equals(prefs.getString(KEY_COOKIE, null))) editor.putLong(KEY_LAST_SEEN, System.currentTimeMillis());
            editor.putString(KEY_COOKIE, token);
        }
        editor.apply();
    }

    static boolean hasSession(Context context) {
        return prefs(context).getString(KEY_COOKIE, null) != null;
    }

    static void saveLanguage(Context context, String language) {
        if ("en".equals(language) || "gu".equals(language)) prefs(context).edit().putString(KEY_LANGUAGE, language).apply();
    }

    static void createChannel(Context context) {
        if (Build.VERSION.SDK_INT < 26) return;
        NotificationManager manager = context.getSystemService(NotificationManager.class);
        boolean gu = "gu".equals(prefs(context).getString(KEY_LANGUAGE, "en"));
        NotificationChannel channel = new NotificationChannel(CHANNEL_ID,
                gu ? "ઓર્ડર અને સ્ટોક અપડેટ" : "Orders and stock updates", NotificationManager.IMPORTANCE_HIGH);
        channel.setDescription(gu ? "ઓર્ડર, ડિલિવરી અને સ્ટોક પાછો આવે ત્યારે સૂચના" : "Order, delivery and back-in-stock alerts");
        manager.createNotificationChannel(channel);
    }

    /** Runs on a background thread. Shows notifications created since the last check. */
    static void check(Context context) {
        SharedPreferences prefs = prefs(context);
        String cookie = prefs.getString(KEY_COOKIE, null);
        if (cookie == null) return;
        HttpURLConnection connection = null;
        try {
            connection = (HttpURLConnection) new URL(MainActivity.SHOP_URL + "api/notifications").openConnection();
            connection.setRequestProperty("Cookie", cookie);
            connection.setRequestProperty("Accept", "application/json");
            connection.setConnectTimeout(30000);
            connection.setReadTimeout(70000); // The free server can take up to a minute to wake up.
            int status = connection.getResponseCode();
            if (status == 401) { saveSession(context, null); return; }
            if (status != 200) return;
            JSONArray items = new JSONObject(read(connection.getInputStream())).optJSONArray("items");
            if (items == null) return;

            long lastSeen = prefs.getLong(KEY_LAST_SEEN, 0), newest = lastSeen;
            boolean firstCheck = lastSeen == 0;
            boolean gu = "gu".equals(prefs.getString(KEY_LANGUAGE, "en"));
            int shown = 0;
            for (int i = 0; i < items.length(); i++) {
                JSONObject item = items.getJSONObject(i);
                long created = parseTime(item.optString("createdAt"));
                if (created > newest) newest = created;
                // On the first check, only record where we are, so old notifications are not replayed.
                if (firstCheck || appVisible || created <= lastSeen || item.optBoolean("isRead") || shown >= MAX_PER_CHECK) continue;
                if (show(context, item, gu)) shown++;
            }
            if (newest > lastSeen) prefs.edit().putLong(KEY_LAST_SEEN, newest).apply();
        } catch (Exception ignored) {
            // Network or server problems: try again at the next scheduled check.
        } finally {
            if (connection != null) connection.disconnect();
        }
    }

    /** Shows a notification that arrived instantly through Firebase. */
    static void showPushed(Context context, JSONObject item) {
        if (appVisible) return; // The open website's bell shows it already.
        show(context, item, "gu".equals(prefs(context).getString(KEY_LANGUAGE, "en")));
    }

    /** Tells the shop which phone to send instant notifications to. Runs in the background. */
    static void registerPushToken(Context context, String token) {
        new Thread(() -> {
            SharedPreferences prefs = prefs(context);
            String cookie = prefs.getString(KEY_COOKIE, null);
            if (cookie == null || token == null) return;
            String key = token + "|" + cookie.hashCode();
            if (key.equals(prefs.getString(KEY_PUSH_REGISTERED, null))) return;
            HttpURLConnection connection = null;
            try {
                connection = (HttpURLConnection) new URL(MainActivity.SHOP_URL + "api/notifications/devices").openConnection();
                connection.setRequestMethod("POST");
                connection.setDoOutput(true);
                connection.setRequestProperty("Cookie", cookie);
                connection.setRequestProperty("Content-Type", "application/json");
                connection.setConnectTimeout(30000);
                connection.setReadTimeout(70000);
                byte[] body = new JSONObject().put("token", token).toString().getBytes("UTF-8");
                connection.getOutputStream().write(body);
                if (connection.getResponseCode() == 201) prefs.edit().putString(KEY_PUSH_REGISTERED, key).apply();
            } catch (Exception ignored) {
                // Retried the next time the shop is opened.
            } finally {
                if (connection != null) connection.disconnect();
            }
        }, "push-register").start();
    }

    /** Each notification is shown once, even if it arrives instantly and again in the 15-minute check. */
    private static synchronized boolean firstTime(Context context, String id) {
        if (id == null || id.isEmpty()) return true;
        SharedPreferences prefs = prefs(context);
        java.util.Set<String> shown = new java.util.HashSet<>(prefs.getStringSet(KEY_SHOWN, new java.util.HashSet<>()));
        if (shown.contains(id)) return false;
        if (shown.size() > 200) shown.clear();
        shown.add(id);
        prefs.edit().putStringSet(KEY_SHOWN, shown).apply();
        return true;
    }

    private static boolean show(Context context, JSONObject item, boolean gu) {
        if (Build.VERSION.SDK_INT >= 33 && context.checkSelfPermission("android.permission.POST_NOTIFICATIONS") != PackageManager.PERMISSION_GRANTED) return false;
        if (!firstTime(context, item.optString("_id", ""))) return false;
        String title = pick(item, "title", gu), message = pick(item, "message", gu);
        if (title.isEmpty()) title = gu ? "રૈયાણી એગ્રો સીડ્સ" : "Raiyani Agro Seeds";
        String link = item.optString("link", "/notifications");
        if (!link.startsWith("/") || link.startsWith("//")) link = "/notifications";

        Intent open = new Intent(context, MainActivity.class)
                .putExtra(EXTRA_LINK, link)
                .addFlags(Intent.FLAG_ACTIVITY_SINGLE_TOP | Intent.FLAG_ACTIVITY_CLEAR_TOP);
        int id = item.optString("_id", title + message).hashCode();
        PendingIntent tap = PendingIntent.getActivity(context, id, open, PendingIntent.FLAG_UPDATE_CURRENT | PendingIntent.FLAG_IMMUTABLE);

        createChannel(context);
        Notification.Builder builder = Build.VERSION.SDK_INT >= 26 ? new Notification.Builder(context, CHANNEL_ID) : new Notification.Builder(context);
        builder.setSmallIcon(R.drawable.ic_stat_notify)
                .setColor(0xFF1F5A32)
                .setContentTitle(title)
                .setContentText(message)
                .setStyle(new Notification.BigTextStyle().bigText(message))
                .setAutoCancel(true)
                .setContentIntent(tap)
                .setWhen(System.currentTimeMillis())
                .setShowWhen(true);
        if (Build.VERSION.SDK_INT < 26) builder.setPriority(Notification.PRIORITY_HIGH).setDefaults(Notification.DEFAULT_ALL);
        context.getSystemService(NotificationManager.class).notify(id, builder.build());
        return true;
    }

    private static String pick(JSONObject item, String field, boolean gu) {
        String value = gu ? item.optString(field + "Gu", "") : "";
        return value.isEmpty() ? item.optString(field, "") : value;
    }

    private static long parseTime(String iso) {
        try {
            SimpleDateFormat format = new SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'", Locale.US);
            format.setTimeZone(TimeZone.getTimeZone("UTC"));
            return format.parse(iso).getTime();
        } catch (Exception error) {
            return 0;
        }
    }

    private static String read(InputStream stream) throws java.io.IOException {
        try (InputStream in = stream; ByteArrayOutputStream out = new ByteArrayOutputStream()) {
            byte[] buffer = new byte[8192];
            for (int n; (n = in.read(buffer)) != -1; ) out.write(buffer, 0, n);
            return out.toString("UTF-8");
        }
    }
}
