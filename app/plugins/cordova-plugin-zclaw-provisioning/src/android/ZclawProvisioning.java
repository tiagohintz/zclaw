package co.azape.zclaw;

import android.Manifest;
import android.bluetooth.BluetoothDevice;
import android.bluetooth.le.ScanResult;
import android.os.Build;
import android.os.ParcelUuid;

import com.espressif.provisioning.DeviceConnectionEvent;
import com.espressif.provisioning.ESPConstants;
import com.espressif.provisioning.ESPDevice;
import com.espressif.provisioning.ESPProvisionManager;
import com.espressif.provisioning.listeners.BleScanListener;
import com.espressif.provisioning.listeners.ProvisionListener;
import com.espressif.provisioning.listeners.ResponseListener;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.apache.cordova.PermissionHelper;
import org.greenrobot.eventbus.EventBus;
import org.greenrobot.eventbus.Subscribe;
import org.greenrobot.eventbus.ThreadMode;
import org.json.JSONArray;
import org.json.JSONException;

import java.nio.charset.StandardCharsets;
import java.util.List;

/**
 * Native side of the zclaw provisioning plugin (Android), over the official
 * esp-idf-provisioning-android library. JS contract in www/EspProvisioning.js;
 * BLE contract (service PROV_ZCLAW, Security1 empty PoP, endpoint custom-data)
 * in docs/FORK.md.
 */
public class ZclawProvisioning extends CordovaPlugin {

  private static final int PERMISSION_REQUEST = 4711;
  private static final long SCAN_TIMEOUT_MS = 15000;

  private ESPProvisionManager manager;
  private ESPDevice espDevice;
  private CallbackContext connectCallback;
  private String wantedPrefix;
  private boolean deviceFound;
  private String[] pendingPermissionArgs;

  @Override
  protected void pluginInitialize() {
    manager = ESPProvisionManager.getInstance(cordova.getContext());
  }

  @Override
  public boolean execute(String action, JSONArray args, CallbackContext callbackContext)
      throws JSONException {
    switch (action) {
      case "connect":
        connectWithPermissions(args.getString(0), callbackContext);
        return true;
      case "sendCustomData":
        sendCustomData(args.getString(0), args.getString(1), callbackContext);
        return true;
      case "sendWifi":
        sendWifi(args.getString(0), args.getString(1), callbackContext);
        return true;
      case "disconnect":
        disconnect(callbackContext);
        return true;
      default:
        return false;
    }
  }

  // ---- connect -------------------------------------------------------------

  private String[] requiredPermissions() {
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
      return new String[] {
        Manifest.permission.BLUETOOTH_SCAN, Manifest.permission.BLUETOOTH_CONNECT
      };
    }
    return new String[] { Manifest.permission.ACCESS_FINE_LOCATION };
  }

  private void connectWithPermissions(String prefix, CallbackContext cb) {
    String[] perms = requiredPermissions();
    boolean granted = true;
    for (String p : perms) granted = granted && PermissionHelper.hasPermission(this, p);

    connectCallback = cb;
    wantedPrefix = prefix;
    if (granted) {
      startScan();
    } else {
      PermissionHelper.requestPermissions(this, PERMISSION_REQUEST, perms);
    }
  }

  @Override
  public void onRequestPermissionResult(int requestCode, String[] permissions, int[] grantResults) {
    if (requestCode != PERMISSION_REQUEST || connectCallback == null) return;
    for (int r : grantResults) {
      if (r != android.content.pm.PackageManager.PERMISSION_GRANTED) {
        failConnect("permissão de Bluetooth negada");
        return;
      }
    }
    startScan();
  }

  private void startScan() {
    deviceFound = false;
    EventBus.getDefault().register(this);

    cordova.getThreadPool().execute(() -> {
      try {
        manager.searchBleEspDevices(wantedPrefix, new BleScanListener() {
          @Override
          public void scanStartFailed() {
            failConnect("scan BLE falhou ao iniciar (Bluetooth desligado?)");
          }

          @Override
          public void onPeripheralFound(BluetoothDevice device, ScanResult scanResult) {
            if (deviceFound) return;
            String serviceUuid = primaryServiceUuid(scanResult);
            if (serviceUuid == null) return;
            deviceFound = true;
            manager.stopBleScan();
            espDevice = manager.createESPDevice(
                ESPConstants.TransportType.TRANSPORT_BLE,
                ESPConstants.SecurityType.SECURITY_1);
            espDevice.setProofOfPossession("");
            espDevice.connectBLEDevice(device, serviceUuid);
            // Resolution continues in onDeviceConnectionEvent.
          }

          @Override
          public void scanCompleted() {
            if (!deviceFound) failConnect("nenhum dispositivo '" + wantedPrefix + "' encontrado");
          }

          @Override
          public void onFailure(Exception e) {
            failConnect("scan BLE falhou: " + e.getMessage());
          }
        });
      } catch (SecurityException e) {
        failConnect("sem permissão de Bluetooth: " + e.getMessage());
      }
    });
  }

  private static String primaryServiceUuid(ScanResult scanResult) {
    if (scanResult.getScanRecord() == null) return null;
    List<ParcelUuid> uuids = scanResult.getScanRecord().getServiceUuids();
    if (uuids == null || uuids.isEmpty()) return null;
    return uuids.get(0).getUuid().toString();
  }

  @Subscribe(threadMode = ThreadMode.MAIN)
  public void onDeviceConnectionEvent(DeviceConnectionEvent event) {
    if (connectCallback == null) return;
    switch (event.getEventType()) {
      case ESPConstants.EVENT_DEVICE_CONNECTED:
        EventBus.getDefault().unregister(this);
        CallbackContext cb = connectCallback;
        connectCallback = null;
        cb.success();
        break;
      case ESPConstants.EVENT_DEVICE_CONNECTION_FAILED:
        failConnect("conexão BLE falhou");
        break;
      case ESPConstants.EVENT_DEVICE_DISCONNECTED:
      default:
        break;
    }
  }

  private void failConnect(String message) {
    try {
      EventBus.getDefault().unregister(this);
    } catch (Exception ignored) { }
    if (connectCallback != null) {
      CallbackContext cb = connectCallback;
      connectCallback = null;
      cb.error(message);
    }
  }

  // ---- custom data + wifi --------------------------------------------------

  private void sendCustomData(String endpoint, String json, CallbackContext cb) {
    if (espDevice == null) {
      cb.error("não conectado");
      return;
    }
    espDevice.sendDataToCustomEndPoint(endpoint, json.getBytes(StandardCharsets.UTF_8),
        new ResponseListener() {
          @Override
          public void onSuccess(byte[] returnData) {
            cb.success(returnData != null ? new String(returnData, StandardCharsets.UTF_8) : "");
          }

          @Override
          public void onFailure(Exception e) {
            cb.error("custom-data falhou: " + e.getMessage());
          }
        });
  }

  private void sendWifi(String ssid, String pass, CallbackContext cb) {
    if (espDevice == null) {
      cb.error("não conectado");
      return;
    }
    espDevice.provision(ssid, pass, new ProvisionListener() {
      @Override public void createSessionFailed(Exception e) { cb.error("sessão falhou: " + e.getMessage()); }
      @Override public void wifiConfigSent() { }
      @Override public void wifiConfigFailed(Exception e) { cb.error("envio de WiFi falhou: " + e.getMessage()); }
      @Override public void wifiConfigApplied() { }
      @Override public void wifiConfigApplyFailed(Exception e) { cb.error("aplicação de WiFi falhou: " + e.getMessage()); }
      @Override public void provisioningFailedFromDevice(ESPConstants.ProvisionFailureReason reason) {
        cb.error("placa reportou falha: " + reason.name());
      }
      @Override public void deviceProvisioningSuccess() { cb.success(); }
      @Override public void onProvisioningFailed(Exception e) { cb.error("provisionamento falhou: " + e.getMessage()); }
    });
  }

  private void disconnect(CallbackContext cb) {
    if (espDevice != null) {
      espDevice.disconnectDevice();
      espDevice = null;
    }
    cb.success();
  }
}
