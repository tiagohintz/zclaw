// JS bridge for the native Espressif provisioning wrappers.
// All methods return Promises. Contract consumed by DeviceProvisioningService.
var exec = require('cordova/exec');

function call(action, args) {
  return new Promise(function (resolve, reject) {
    exec(resolve, reject, 'ZclawProvisioning', action, args || []);
  });
}

module.exports = {
  // Scans BLE and connects to the device advertising `serviceName`
  // (Security1, empty proof-of-possession).
  connect: function (serviceName) {
    return call('connect', [serviceName]);
  },

  // Sends a JSON object to a protocomm custom endpoint (e.g. 'custom-data').
  sendCustomData: function (endpoint, data) {
    return call('sendCustomData', [endpoint, JSON.stringify(data)]);
  },

  // Sends WiFi credentials via the standard prov-config flow; resolves when the
  // board reports the connection succeeded.
  sendWifi: function (ssid, password) {
    return call('sendWifi', [ssid, password]);
  },

  disconnect: function () {
    return call('disconnect', []);
  },
};
