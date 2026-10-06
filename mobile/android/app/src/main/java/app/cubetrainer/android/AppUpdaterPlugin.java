package app.cubetrainer.android;

import android.content.Intent;
import android.net.Uri;
import android.os.Build;
import android.provider.Settings;

import androidx.core.content.FileProvider;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;

import java.io.File;
import java.io.FileOutputStream;
import java.io.InputStream;
import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;

/**
 * In-app updates: downloads an APK from GitHub and opens Android's package installer.
 * Android itself refuses to install it unless it is signed with the same key as the installed app.
 */
@CapacitorPlugin(name = "AppUpdater")
public class AppUpdaterPlugin extends Plugin {

    private static final int MAX_REDIRECTS = 5;
    private final ExecutorService worker = Executors.newSingleThreadExecutor();

    @PluginMethod
    public void canInstall(PluginCall call) {
        boolean allowed = Build.VERSION.SDK_INT < Build.VERSION_CODES.O
                || getContext().getPackageManager().canRequestPackageInstalls();
        JSObject ret = new JSObject();
        ret.put("allowed", allowed);
        call.resolve(ret);
    }

    @PluginMethod
    public void openInstallSettings(PluginCall call) {
        Intent intent = new Intent(Settings.ACTION_MANAGE_UNKNOWN_APP_SOURCES,
                Uri.parse("package:" + getContext().getPackageName()));
        intent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
        call.resolve();
    }

    @PluginMethod
    public void downloadAndInstall(PluginCall call) {
        final String url = call.getString("url");
        String requested = call.getString("fileName");
        final String fileName = (requested == null || !requested.matches("[A-Za-z0-9._-]{1,100}\\.apk"))
                ? "update.apk" : requested;
        if (url == null || !isAllowedUrl(url)) {
            call.reject("Updates can only be downloaded from GitHub.");
            return;
        }
        worker.execute(() -> {
            try {
                File dir = new File(getContext().getCacheDir(), "updates");
                deleteOldDownloads(dir);
                if (!dir.exists() && !dir.mkdirs()) throw new IllegalStateException("Cannot create the download folder.");
                File apk = new File(dir, fileName);
                download(url, apk);
                install(apk);
                call.resolve();
            } catch (Exception e) {
                call.reject(e.getMessage() == null ? "The download failed." : e.getMessage());
            }
        });
    }

    private void download(String start, File target) throws Exception {
        String current = start;
        HttpURLConnection conn = null;
        for (int hop = 0; hop <= MAX_REDIRECTS; hop++) {
            if (!isAllowedUrl(current)) throw new IllegalStateException("The download was redirected to an untrusted address.");
            conn = (HttpURLConnection) new URL(current).openConnection();
            conn.setInstanceFollowRedirects(false);
            conn.setConnectTimeout(15000);
            conn.setReadTimeout(30000);
            int code = conn.getResponseCode();
            if (code == 301 || code == 302 || code == 303 || code == 307 || code == 308) {
                String next = conn.getHeaderField("Location");
                conn.disconnect();
                if (next == null) throw new IllegalStateException("Bad redirect from GitHub.");
                current = new URL(new URL(current), next).toString();
                conn = null;
                continue;
            }
            if (code != 200) {
                conn.disconnect();
                throw new IllegalStateException("GitHub answered " + code + " for the download.");
            }
            break;
        }
        if (conn == null) throw new IllegalStateException("Too many redirects.");

        long total = conn.getContentLengthLong();
        long received = 0;
        long lastNotified = 0;
        try (InputStream in = conn.getInputStream(); OutputStream out = new FileOutputStream(target)) {
            byte[] buf = new byte[64 * 1024];
            int n;
            while ((n = in.read(buf)) > 0) {
                out.write(buf, 0, n);
                received += n;
                long now = System.currentTimeMillis();
                if (now - lastNotified > 150) {
                    lastNotified = now;
                    notifyProgress(received, total);
                }
            }
        } finally {
            conn.disconnect();
        }
        notifyProgress(received, total);
        if (total > 0 && received != total) throw new IllegalStateException("The download was cut short. Try again.");
        if (received < 1024) throw new IllegalStateException("The downloaded file is not an app package.");
    }

    private void notifyProgress(long received, long total) {
        JSObject p = new JSObject();
        p.put("received", received);
        p.put("total", total);
        notifyListeners("progress", p);
    }

    private void install(File apk) {
        Uri uri = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", apk);
        Intent intent = new Intent(Intent.ACTION_VIEW);
        intent.setDataAndType(uri, "application/vnd.android.package-archive");
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION | Intent.FLAG_ACTIVITY_NEW_TASK);
        getContext().startActivity(intent);
    }

    private static void deleteOldDownloads(File dir) {
        File[] old = dir.listFiles();
        if (old == null) return;
        for (File f : old) //noinspection ResultOfMethodCallIgnored
            f.delete();
    }

    /** https only, and only GitHub's own hosts (release assets redirect to githubusercontent.com). */
    static boolean isAllowedUrl(String s) {
        try {
            URL u = new URL(s);
            String h = u.getHost().toLowerCase();
            return "https".equals(u.getProtocol())
                    && (h.equals("github.com") || h.endsWith(".githubusercontent.com"));
        } catch (Exception e) {
            return false;
        }
    }
}
