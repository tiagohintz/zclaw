package co.azape.zclaw;

import org.apache.cordova.CallbackContext;
import org.apache.cordova.CordovaPlugin;
import org.json.JSONArray;

/**
 * Native side of the zclaw provisioning plugin (Android).
 *
 * TODO(fase nativa): implementar sobre com.espressif.provisioning (lib
 * esp-idf-provisioning-android, referenciada em provisioning.gradle):
 *  - connect(serviceName): ESPProvisionManager.searchBleEspDevices(prefix) +
 *    createESPDevice(SECURITY_1, pop vazio) + connectBLEDevice
 *  - sendCustomData(endpoint, json): espDevice.sendDataToCustomEndPoint
 *  - sendWifi(ssid, pass): espDevice.provision(ssid, pass, listener)
 *  - disconnect(): espDevice.disconnectDevice
 * Contrato JS em www/EspProvisioning.js; contrato BLE em docs/FORK.md.
 */
public class ZclawProvisioning extends CordovaPlugin {

  @Override
  public boolean execute(String action, JSONArray args, CallbackContext callbackContext) {
    switch (action) {
      case "connect":
      case "sendCustomData":
      case "sendWifi":
      case "disconnect":
        callbackContext.error("not implemented: native provisioning layer pending");
        return true;
      default:
        return false;
    }
  }
}
