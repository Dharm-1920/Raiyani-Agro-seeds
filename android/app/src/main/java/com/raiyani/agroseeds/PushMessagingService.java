package com.raiyani.agroseeds;

import com.google.firebase.messaging.FirebaseMessagingService;
import com.google.firebase.messaging.RemoteMessage;

import org.json.JSONObject;

import java.util.Map;

/** Receives instant notifications from Firebase (only active once Firebase is configured). */
public class PushMessagingService extends FirebaseMessagingService {
    @Override
    public void onMessageReceived(RemoteMessage remoteMessage) {
        Map<String, String> data = remoteMessage.getData();
        if (data.isEmpty() || !AppNotifications.hasSession(this)) return;
        try {
            JSONObject item = new JSONObject();
            item.put("_id", data.get("id"));
            for (String key : new String[] { "title", "titleGu", "message", "messageGu", "link" }) {
                if (data.get(key) != null) item.put(key, data.get(key));
            }
            AppNotifications.showPushed(getApplicationContext(), item);
        } catch (Exception ignored) {
            // A malformed message is skipped; the 15-minute check still delivers it.
        }
    }

    @Override
    public void onNewToken(String token) {
        AppNotifications.registerPushToken(getApplicationContext(), token);
    }
}
