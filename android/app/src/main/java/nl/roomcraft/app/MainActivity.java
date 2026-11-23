package nl.roomcraft.app;

import android.annotation.SuppressLint;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.ContentValues;
import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.os.Bundle;
import android.os.Environment;
import android.provider.MediaStore;
import android.util.Base64;
import android.view.Menu;
import android.view.MenuItem;
import android.webkit.JavascriptInterface;
import android.webkit.ValueCallback;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.FileOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.OutputStream;
import java.nio.charset.StandardCharsets;
import java.util.Collections;

/**
 * RoomCraft NL for Android.
 *
 * The APK contains the whole app: the built React interface sits in
 * {@code assets/web} and is served to the WebView from an in-app origin that
 * never touches the network. Designs are stored on the device, so no RoomCraft
 * server, desktop app or internet connection is needed.
 */
public class MainActivity extends Activity {

    /** Virtual origin served from the APK; nothing is ever fetched from it. */
    private static final String ORIGIN_HOST = "appassets.androidplatform.net";
    private static final String ORIGIN = "https://" + ORIGIN_HOST;
    private static final String ASSET_ROOT = "web/";
    private static final int FILE_CHOOSER_REQUEST = 41;

    private WebView webView;
    private ValueCallback<Uri[]> fileCallback;

    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);
        showApp();
    }

    @SuppressLint("SetJavaScriptEnabled")
    private void showApp() {
        webView = new WebView(this);
        webView.setBackgroundColor(0xFF16130F);

        WebSettings settings = webView.getSettings();
        settings.setJavaScriptEnabled(true);
        settings.setDomStorageEnabled(true);
        settings.setDatabaseEnabled(true);
        settings.setMediaPlaybackRequiresUserGesture(false);
        settings.setAllowFileAccess(false);

        webView.addJavascriptInterface(new SaveBridge(), "RoomCraftNative");

        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(
                    WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri != null && ORIGIN_HOST.equals(uri.getHost())) {
                    return serveAsset(uri);
                }
                return null;
            }

            @Override
            public boolean shouldOverrideUrlLoading(WebView view, WebResourceRequest request) {
                Uri uri = request.getUrl();
                if (uri == null || ORIGIN_HOST.equals(uri.getHost())) return false;
                // A retailer product link belongs in the browser, not in the planner.
                try {
                    startActivity(new Intent(Intent.ACTION_VIEW, uri));
                } catch (Exception ignored) {
                    // No browser installed: stay in the app.
                }
                return true;
            }
        });

        webView.setWebChromeClient(new WebChromeClient() {
            @Override
            public boolean onShowFileChooser(
                    WebView view, ValueCallback<Uri[]> callback, FileChooserParams params) {
                if (fileCallback != null) {
                    fileCallback.onReceiveValue(null);
                }
                fileCallback = callback;
                Intent intent = params.createIntent();
                try {
                    startActivityForResult(intent, FILE_CHOOSER_REQUEST);
                } catch (Exception error) {
                    fileCallback = null;
                    Toast.makeText(
                                    MainActivity.this,
                                    "Geen bestandskiezer beschikbaar.",
                                    Toast.LENGTH_LONG)
                            .show();
                    return false;
                }
                return true;
            }
        });

        setContentView(webView);
        webView.loadUrl(ORIGIN + "/index.html");
    }

    /** Maps a request path onto the bundled build in assets/web. */
    private WebResourceResponse serveAsset(Uri uri) {
        String path = uri.getPath();
        if (path == null || path.isEmpty() || "/".equals(path)) path = "/index.html";
        if (path.contains("..")) return notFound();

        String assetPath = ASSET_ROOT + path.substring(1);
        InputStream stream;
        try {
            stream = getAssets().open(assetPath);
        } catch (IOException missing) {
            return notFound();
        }
        String mime = mimeType(assetPath);
        return new WebResourceResponse(mime, isText(mime) ? "utf-8" : null, stream);
    }

    private static WebResourceResponse notFound() {
        return new WebResourceResponse(
                "text/plain",
                "utf-8",
                404,
                "Not Found",
                Collections.<String, String>emptyMap(),
                new ByteArrayInputStream("Niet gevonden".getBytes(StandardCharsets.UTF_8)));
    }

    private static String mimeType(String path) {
        String lower = path.toLowerCase();
        if (lower.endsWith(".html")) return "text/html";
        if (lower.endsWith(".js")) return "text/javascript";
        if (lower.endsWith(".css")) return "text/css";
        if (lower.endsWith(".json")) return "application/json";
        if (lower.endsWith(".svg")) return "image/svg+xml";
        if (lower.endsWith(".png")) return "image/png";
        if (lower.endsWith(".jpg") || lower.endsWith(".jpeg")) return "image/jpeg";
        if (lower.endsWith(".webp")) return "image/webp";
        if (lower.endsWith(".gif")) return "image/gif";
        if (lower.endsWith(".woff2")) return "font/woff2";
        if (lower.endsWith(".woff")) return "font/woff";
        if (lower.endsWith(".glb")) return "model/gltf-binary";
        if (lower.endsWith(".wasm")) return "application/wasm";
        return "application/octet-stream";
    }

    private static boolean isText(String mime) {
        return mime.startsWith("text/")
                || mime.equals("application/json")
                || mime.equals("image/svg+xml");
    }

    /**
     * Export bridge: a WebView cannot follow blob downloads, so the interface
     * hands the bytes over and they are written to the Download folder.
     */
    private class SaveBridge {
        @JavascriptInterface
        public void saveFile(String name, String base64, String mime) {
            String safeName = name == null || name.trim().isEmpty() ? "roomcraft-export" : name;
            try {
                byte[] bytes = Base64.decode(base64 == null ? "" : base64, Base64.DEFAULT);
                String location;
                if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
                    ContentValues values = new ContentValues();
                    values.put(MediaStore.MediaColumns.DISPLAY_NAME, safeName);
                    values.put(MediaStore.MediaColumns.MIME_TYPE, mime);
                    values.put(
                            MediaStore.MediaColumns.RELATIVE_PATH,
                            Environment.DIRECTORY_DOWNLOADS + "/RoomCraft NL");
                    Uri target =
                            getContentResolver()
                                    .insert(MediaStore.Downloads.EXTERNAL_CONTENT_URI, values);
                    if (target == null) throw new IOException("Downloads is niet beschikbaar.");
                    try (OutputStream out = getContentResolver().openOutputStream(target)) {
                        if (out == null) throw new IOException("Bestand niet schrijfbaar.");
                        out.write(bytes);
                    }
                    location = "Download/RoomCraft NL/" + safeName;
                } else {
                    File dir =
                            new File(
                                    getExternalFilesDir(Environment.DIRECTORY_DOWNLOADS),
                                    "RoomCraft NL");
                    if (!dir.exists() && !dir.mkdirs()) {
                        throw new IOException("Map niet aan te maken.");
                    }
                    File file = new File(dir, safeName);
                    try (FileOutputStream out = new FileOutputStream(file)) {
                        out.write(bytes);
                    }
                    location = file.getAbsolutePath();
                }
                toast("Opgeslagen: " + location);
            } catch (Exception error) {
                toast("Opslaan mislukt: " + error.getMessage());
            }
        }
    }

    private void toast(final String message) {
        runOnUiThread(
                () -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_LONG).show());
    }

    @Override
    public boolean onCreateOptionsMenu(Menu menu) {
        menu.add(0, 1, 0, "Herladen");
        menu.add(0, 2, 1, "Over RoomCraft NL");
        return true;
    }

    @Override
    public boolean onOptionsItemSelected(MenuItem item) {
        if (item.getItemId() == 1) {
            if (webView != null) webView.reload();
            return true;
        }
        if (item.getItemId() == 2) {
            showAbout();
            return true;
        }
        return super.onOptionsItemSelected(item);
    }

    private void showAbout() {
        String version;
        try {
            version =
                    getPackageManager()
                            .getPackageInfo(getPackageName(), 0)
                            .versionName;
        } catch (Exception error) {
            version = "?";
        }
        new AlertDialog.Builder(this)
                .setTitle("RoomCraft NL")
                .setMessage(
                        "Versie "
                                + version
                                + "\n\n2D/3D interieurplanner voor Nederlandse meubelwinkels."
                                + " De app werkt volledig offline: je ontwerpen worden op dit"
                                + " apparaat bewaard en je kunt ze exporteren naar je Downloads.")
                .setPositiveButton("Sluiten", null)
                .show();
    }

    @Override
    protected void onActivityResult(int requestCode, int resultCode, Intent data) {
        if (requestCode == FILE_CHOOSER_REQUEST) {
            if (fileCallback == null) return;
            Uri[] result = null;
            if (resultCode == RESULT_OK && data != null) {
                if (data.getClipData() != null) {
                    int count = data.getClipData().getItemCount();
                    result = new Uri[count];
                    for (int index = 0; index < count; index += 1) {
                        result[index] = data.getClipData().getItemAt(index).getUri();
                    }
                } else if (data.getData() != null) {
                    result = new Uri[] {data.getData()};
                }
            }
            fileCallback.onReceiveValue(result);
            fileCallback = null;
            return;
        }
        super.onActivityResult(requestCode, resultCode, data);
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
        if (webView != null) {
            webView.destroy();
            webView = null;
        }
        super.onDestroy();
    }
}
