package app.satnam.pub;

import android.app.Activity;
import android.nfc.NfcAdapter;
import android.nfc.Tag;
import android.nfc.tech.IsoDep;
import android.os.Bundle;
import android.os.Handler;
import android.os.Looper;

import androidx.annotation.Nullable;

import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.annotation.CapacitorPlugin;
import com.getcapacitor.annotation.PluginMethod;

import java.io.IOException;
import java.util.Locale;

@CapacitorPlugin(name = "NfcIsoDep")
public class NfcIsoDepPlugin extends Plugin {
  private static final int READER_FLAGS =
      NfcAdapter.FLAG_READER_NFC_A
          | NfcAdapter.FLAG_READER_SKIP_NDEF_CHECK;

  private final Handler mainHandler = new Handler(Looper.getMainLooper());

  private NfcAdapter nfcAdapter;
  private IsoDep isoDep;
  private Tag currentTag;
  private boolean readerModeEnabled = false;
  private PluginCall pendingConnectCall;
  private Runnable connectTimeoutRunnable;

  @Override
  public void load() {
    super.load();
    Activity activity = getActivity();
    if (activity != null) {
      nfcAdapter = NfcAdapter.getDefaultAdapter(activity);
    }
  }

  @PluginMethod
  public void isAvailable(PluginCall call) {
    boolean available = nfcAdapter != null && nfcAdapter.isEnabled();
    JSObject ret = new JSObject();
    ret.put("available", available);
    call.resolve(ret);
  }

  @PluginMethod
  public void connect(PluginCall call) {
    if (pendingConnectCall != null) {
      call.reject("A connect() operation is already in progress");
      return;
    }

    if (nfcAdapter == null) {
      call.reject("NFC adapter not available on this device");
      return;
    }
    if (!nfcAdapter.isEnabled()) {
      call.reject("NFC is turned off");
      return;
    }

    // If already connected, resolve immediately
    if (isoDep != null && isoDep.isConnected()) {
      JSObject ret = new JSObject();
      ret.put("success", true);
      call.resolve(ret);
      return;
    }

    pendingConnectCall = call;

    Activity activity = getActivity();
    if (activity == null) {
      finishConnectWithError("Activity not available");
      return;
    }

    // Enable reader mode and wait for ISO-DEP tag
    try {
      activity.runOnUiThread(() -> {
        nfcAdapter.enableReaderMode(
            activity,
            tag -> onTagDiscovered(tag),
            READER_FLAGS,
            new Bundle()
        );
        readerModeEnabled = true;
      });
    } catch (Exception e) {
      finishConnectWithError("Failed to enable reader mode: " + safeMessage(e));
      return;
    }

    // Timeout after 30 seconds
    connectTimeoutRunnable = () -> finishConnectWithError("NFC connect timeout");
    mainHandler.postDelayed(connectTimeoutRunnable, 30_000);
  }

  private void onTagDiscovered(Tag tag) {
    // Called from binder thread
    try {
      IsoDep candidate = IsoDep.get(tag);
      if (candidate == null) {
        // Not ISO-DEP, ignore
        return;
      }
      candidate.setTimeout(5000);
      candidate.connect();

      synchronized (this) {
        // Close previous if present
        if (isoDep != null) {
          try { isoDep.close(); } catch (Exception ignored) {}
        }
        isoDep = candidate;
        currentTag = tag;
      }

      // Resolve pending connect
      if (pendingConnectCall != null) {
        clearConnectTimeout();
        JSObject ret = new JSObject();
        ret.put("success", true);
        pendingConnectCall.resolve(ret);
        pendingConnectCall = null;
      }
    } catch (IOException e) {
      finishConnectWithError("ISO-DEP connect failed: " + safeMessage(e));
    }
  }

  @PluginMethod
  public void transceive(PluginCall call) {
    String apduHex = call.getString("apduHex");
    if (apduHex == null || apduHex.isEmpty()) {
      call.reject("Missing apduHex");
      return;
    }

    IsoDep dep;
    synchronized (this) {
      dep = isoDep;
    }

    if (dep == null || !dep.isConnected()) {
      call.reject("Not connected to an ISO-DEP tag");
      return;
    }

    try {
      byte[] cmd = hexToBytes(apduHex);
      byte[] resp = dep.transceive(cmd);
      JSObject ret = new JSObject();
      ret.put("responseHex", bytesToHex(resp));
      call.resolve(ret);
    } catch (IllegalArgumentException e) {
      call.reject("Invalid APDU hex: " + safeMessage(e));
    } catch (IOException e) {
      call.reject("APDU transceive failed: " + safeMessage(e));
    }
  }

  @PluginMethod
  public void disconnect(PluginCall call) {
    Activity activity = getActivity();
    if (activity != null && readerModeEnabled && nfcAdapter != null) {
      try {
        activity.runOnUiThread(() -> nfcAdapter.disableReaderMode(activity));
      } catch (Exception ignored) {}
    }
    readerModeEnabled = false;

    synchronized (this) {
      if (isoDep != null) {
        try { isoDep.close(); } catch (Exception ignored) {}
        isoDep = null;
      }
      currentTag = null;
    }

    JSObject ret = new JSObject();
    ret.put("success", true);
    call.resolve(ret);
  }

  private void finishConnectWithError(String message) {
    clearConnectTimeout();
    if (pendingConnectCall != null) {
      pendingConnectCall.reject(message);
      pendingConnectCall = null;
    }
    disableReaderModeSafe();
  }

  private void clearConnectTimeout() {
    if (connectTimeoutRunnable != null) {
      mainHandler.removeCallbacks(connectTimeoutRunnable);
      connectTimeoutRunnable = null;
    }
  }

  private void disableReaderModeSafe() {
    Activity activity = getActivity();
    if (activity != null && readerModeEnabled && nfcAdapter != null) {
      try { activity.runOnUiThread(() -> nfcAdapter.disableReaderMode(activity)); } catch (Exception ignored) {}
    }
    readerModeEnabled = false;
  }

  private static String safeMessage(@Nullable Throwable t) {
    return (t != null && t.getMessage() != null) ? t.getMessage() : "Unknown error";
  }

  private static byte[] hexToBytes(String hex) {
    String s = hex.trim();
    if ((s.length() % 2) != 0) throw new IllegalArgumentException("Hex length must be even");
    int len = s.length();
    byte[] out = new byte[len / 2];
    for (int i = 0; i < len; i += 2) {
      int hi = Character.digit(s.charAt(i), 16);
      int lo = Character.digit(s.charAt(i + 1), 16);
      if (hi < 0 || lo < 0) throw new IllegalArgumentException("Invalid hex");
      out[i / 2] = (byte) ((hi << 4) + lo);
    }
    return out;
  }

  private static String bytesToHex(byte[] bytes) {
    StringBuilder sb = new StringBuilder(bytes.length * 2);
    for (byte b : bytes) {
      sb.append(String.format(Locale.US, "%02X", b));
    }
    return sb.toString();
  }
}

