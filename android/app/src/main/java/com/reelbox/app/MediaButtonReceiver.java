package com.reelbox.app;

import android.content.BroadcastReceiver;
import android.content.Context;
import android.content.Intent;

/** Play/pause/next/previous tapped on the playback notification. */
public class MediaButtonReceiver extends BroadcastReceiver {

    @Override
    public void onReceive(Context context, Intent intent) {
        if (intent.getAction() != null) MediaPlaybackService.button(intent.getAction());
    }
}
