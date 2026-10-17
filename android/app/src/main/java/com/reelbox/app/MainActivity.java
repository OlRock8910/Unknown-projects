package com.reelbox.app;

import android.os.Build;
import android.os.Bundle;
import android.webkit.WebView;
import androidx.activity.OnBackPressedCallback;
import com.getcapacitor.BridgeActivity;

public class MainActivity extends BridgeActivity {

    @Override
    public void onCreate(Bundle savedInstanceState) {
        registerPlugin(GalleryPlugin.class);
        super.onCreate(savedInstanceState);
        bridge.setWebViewClient(new MediaWebViewClient(bridge));

        // Playback continues with the app hidden; keep the WebView's renderer
        // at full priority then too, so it is not reclaimed mid-song.
        if (Build.VERSION.SDK_INT >= 26) {
            bridge.getWebView().setRendererPriorityPolicy(WebView.RENDERER_PRIORITY_IMPORTANT, false);
        }

        // The app keeps its screens in browser history (player, info sheet,
        // tabs), so the system Back button steps back through them first.
        // On the first screen, Back sends the app to the background.
        getOnBackPressedDispatcher()
            .addCallback(
                this,
                new OnBackPressedCallback(true) {
                    @Override
                    public void handleOnBackPressed() {
                        if (bridge.getWebView().canGoBack()) {
                            bridge.getWebView().goBack();
                        } else {
                            // Like a music app: leave it running so a song keeps playing.
                            moveTaskToBack(true);
                        }
                    }
                }
            );
    }

    @Override
    public void onDestroy() {
        // The WebView doing the playing is going away, so the controls go too.
        if (isFinishing()) MediaPlaybackService.hide();
        super.onDestroy();
    }
}
