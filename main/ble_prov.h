#ifndef BLE_PROV_H
#define BLE_PROV_H

// Runs BLE provisioning for the companion app (blocks forever):
// receives WiFi credentials plus device_id/LLM settings over BLE,
// persists them to zclaw NVS keys, then reboots into the normal path.
// Compiled only when CONFIG_ZCLAW_BLE_PROVISIONING is enabled.
void ble_prov_run(void);

#endif // BLE_PROV_H
