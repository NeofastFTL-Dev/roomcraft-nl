package nl.roomcraft.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Bundle;
import android.text.InputType;
import android.view.Gravity;
import android.view.Menu;
import android.view.MenuItem;
import android.view.View;
import android.view.ViewGroup;
import android.webkit.WebResourceError;
import android.webkit.WebResourceRequest;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Button;
import android.widget.EditText;
import android.widget.FrameLayout;
import android.widget.LinearLayout;
import android.widget.TextView;
import android.widget.Toast;

/**
 * RoomCraft NL client.
 *
 * The planner needs PostgreSQL and the Express server, so the phone does not run
 * the app itself: this client loads the interface from a RoomCraft server on the
 * local network (the desktop app or `npm run dev`) and remembers its address.
 */
public class MainActivity extends Activity {

    private static final String PREFS = "roomcraft";
    private static final String PREF_SERVER = "server";

    private SharedPreferences preferences;
    private WebView webView;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        preferences = getSharedPreferences(PREFS, MODE_PRIVATE);
        String server = preferences.getString(PREF_SERVER, null);
        if (server == null) {
            showSetup(null);
        } else {
            showWeb(server);
        }
    }

    private int dp(int value) {
        return Math.round(value * getResources().getDisplayMetrics().density);
    }

    private void showSetup(String previous) {
        destroyWebView();

        LinearLayout layout = new LinearLayout(this);
        layout.setOrientation(LinearLayout.VERTICAL);
        layout.setGravity(Gravity.CENTER_VERTICAL);
        layout.setBackgroundColor(Color.parseColor("#16130f"));
        layout.setPadding(dp(24), dp(24), dp(24), dp(24));

        TextView title = new TextView(this);
        title.setText("RoomCraft NL");
        title.setTextColor(Color.parseColor("#ff9ec8"));
        title.setTextSize(28);
        layout.addView(title);

        TextView explanation = new TextView(this);
        explanation.setText(
                "Deze app toont RoomCraft vanaf een RoomCraft-server op je computer of in je netwerk.\n\n"
                        + "Start RoomCraft op de computer (desktop-app of `npm run dev`) en vul hier het adres in, "
                        + "bijvoorbeeld http://192.168.1.20:41731");
        explanation.setTextColor(Color.parseColor("#d5d5d5"));
        explanation.setTextSize(16);
        explanation.setPadding(0, dp(12), 0, dp(16));
        layout.addView(explanation);

        EditText input = new EditText(this);
        input.setHint("http://192.168.1.20:41731");
        input.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        input.setSingleLine(true);
        if (previous != null) input.setText(previous);
        layout.addView(input);

        Button connect = new Button(this);
        connect.setText("Verbinden");
        connect.setOnClickListener(view -> {
            String server = normalize(input.getText().toString());
            if (server == null) {
                Toast.makeText(this, "Vul eerst het adres van de server in.", Toast.LENGTH_SHORT).show();
                return;
            }
            preferences.edit().putString(PREF_SERVER, server).apply();
            showWeb(server);
        });
        layout.addView(connect, new LinearLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT));

        setContentView(layout);
    }

    private static String normalize(String raw) {
        String value = raw == null ? "" : raw.trim();
        if (value.isEmpty()) return null;
        if (!value.startsWith("http://") && !value.startsWith("https://")) {
            value = "http://" + value;
        }
        if (!value.endsWith("/")) value = value + "/";
        return value;
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showWeb(String server) {
        destroyWebView();

        FrameLayout root = new FrameLayout(this);
        webView = new WebView(this);
        webView.setBackgroundColor(Color.parseColor("#16130f"));

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setMixedContentMode(WebSettings.MIXED_CONTENT_ALWAYS_ALLOW);

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(
                    WebView view, WebResourceRequest request, WebResourceError error) {
                if (request.isForMainFrame()) {
                    Toast.makeText(
                                    MainActivity.this,
                                    "Server niet bereikbaar: " + request.getUrl(),
                                    Toast.LENGTH_LONG)
                            .show();
                }
            }
        });

        root.addView(webView, new FrameLayout.LayoutParams(
                ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.MATCH_PARENT));
        setContentView(root);
        webView.loadUrl(server);
    }

    private void destroyWebView() {
        if (webView != null) {
            if (webView.getParent() instanceof ViewGroup) {
                ((ViewGroup) webView.getParent()).removeView(webView);
            }
            webView.destroy();
            webView = null;
        }
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0, 1, 0, "Server wijzigen");
        if (webView != null) {
            menu.add(0, 2, 1, "Herladen");
        }
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == 1) {
            showSetup(preferences.getString(PREF_SERVER, null));
            invalidateOptionsMenu();
            return true;
        }
        if (item.getItemId() == 2 && webView != null) {
            webView.reload();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
            return;
        }
        super.onBackPressed();
    }

    @Override
    protected void onDestroy() {
        destroyWebView();
        super.onDestroy();
    }
}
