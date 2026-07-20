// Orchestrates onboarding of a new board. UI flow:
//   1. devices.create -> { deviceId, wsToken }
//   2. BLE: find PROV_ZCLAW, send custom-data JSON, send WiFi credentials
//   3. Board stores everything in NVS, reboots, connects to /device-ws
// BLE itself lives in the native Cordova plugin (cordova-plugin-zclaw-provisioning),
// exposed as window.EspProvisioning. See ../../plugins/ and docs/FORK.md.
import MeteorCallWrapper from './MeteorCallWrapper.js';

const BLE_SERVICE_NAME = 'PROV_ZCLAW';

function plugin() {
  const p = typeof window !== 'undefined' && window.EspProvisioning;
  if (!p) {
    throw new Error(
      'BLE provisioning só está disponível no app instalado (plugin Cordova ausente).'
    );
  }
  return p;
}

const DeviceProvisioningService = {
  /**
   * Full onboarding. wsUrl is the public wss:// URL of this Meteor server.
   * @param {{name: string, ssid: string, password: string,
   *          llmKey: string, llmBackend: string, llmModel?: string, wsUrl: string}} opts
   * @returns {Promise<{deviceId: string}>}
   */
  async provision({ name, ssid, password, llmKey, llmBackend, llmModel, wsUrl }) {
    const { deviceId, wsToken } = await MeteorCallWrapper.call('devices.create', { name });

    const esp = plugin();
    await esp.connect(BLE_SERVICE_NAME);
    await esp.sendCustomData('custom-data', {
      device_id: deviceId,
      llm_key: llmKey,
      llm_backend: llmBackend,
      ...(llmModel ? { llm_model: llmModel } : {}),
      ws_url: wsUrl,
      ws_token: wsToken,
    });
    await esp.sendWifi(ssid, password); // board validates, persists, reboots
    return { deviceId };
  },

  isAvailable() {
    return typeof window !== 'undefined' && !!window.EspProvisioning;
  },
};

export default DeviceProvisioningService;
