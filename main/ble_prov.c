#include "sdkconfig.h"
#if CONFIG_ZCLAW_BLE_PROVISIONING

#include "ble_prov.h"
#include "memory.h"
#include "nvs_keys.h"

#include <stdlib.h>
#include <string.h>
#include "esp_log.h"
#include "esp_err.h"
#include "esp_event.h"
#include "esp_netif.h"
#include "esp_wifi.h"
#include "esp_system.h"
#include "freertos/FreeRTOS.h"
#include "freertos/task.h"
#include "wifi_provisioning/manager.h"
#include "wifi_provisioning/scheme_ble.h"
#include "cJSON.h"

// BLE contract with the companion app (see docs/FORK.md).
#define BLE_PROV_SERVICE_NAME "PROV_ZCLAW"
#define BLE_PROV_ENDPOINT     "custom-data"

static const char *TAG = "ble_prov";

// Credentials received over BLE, persisted only after the connection succeeds.
static char s_pending_ssid[33];
static char s_pending_pass[65];

static void on_prov_event(void *arg, esp_event_base_t base, int32_t id, void *data)
{
    (void)arg;
    if (base != WIFI_PROV_EVENT) {
        return;
    }

    switch (id) {
    case WIFI_PROV_CRED_RECV: {
        const wifi_sta_config_t *sta = (const wifi_sta_config_t *)data;
        if (sta) {
            memset(s_pending_ssid, 0, sizeof(s_pending_ssid));
            memset(s_pending_pass, 0, sizeof(s_pending_pass));
            memcpy(s_pending_ssid, sta->ssid, sizeof(sta->ssid));
            memcpy(s_pending_pass, sta->password, sizeof(sta->password));
            ESP_LOGI(TAG, "Received WiFi credentials for ssid='%s'", s_pending_ssid);
        }
        break;
    }
    case WIFI_PROV_CRED_SUCCESS:
        // Store in zclaw's own NVS keys so device_is_configured() and
        // local_admin_wifi_connect_from_store() find them after reboot.
        memory_set(NVS_KEY_WIFI_SSID, s_pending_ssid);
        memory_set(NVS_KEY_WIFI_PASS, s_pending_pass);
        ESP_LOGI(TAG, "WiFi credentials verified and stored");
        break;
    case WIFI_PROV_CRED_FAIL:
        // Reboot back into provisioning mode so the app can simply retry.
        ESP_LOGE(TAG, "WiFi connection failed (wrong password or AP not found), restarting...");
        vTaskDelay(pdMS_TO_TICKS(2000));
        esp_restart();
        break;
    default:
        break;
    }
}

// Companion-app endpoint. Payload is a JSON object of optional strings:
// {"device_id": "...", "llm_key": "...", "llm_backend": "...", "llm_model": "..."}
static esp_err_t custom_data_handler(uint32_t session_id, const uint8_t *inbuf, ssize_t inlen,
                                     uint8_t **outbuf, ssize_t *outlen, void *priv_data)
{
    (void)session_id;
    (void)priv_data;
    if (!inbuf || inlen <= 0) {
        return ESP_ERR_INVALID_ARG;
    }

    char *json_str = malloc((size_t)inlen + 1);
    if (!json_str) {
        return ESP_ERR_NO_MEM;
    }
    memcpy(json_str, inbuf, (size_t)inlen);
    json_str[inlen] = '\0';

    cJSON *json = cJSON_Parse(json_str);
    free(json_str);
    if (!json) {
        ESP_LOGE(TAG, "Invalid JSON on %s endpoint", BLE_PROV_ENDPOINT);
        return ESP_FAIL;
    }

    static const struct {
        const char *field;
        const char *nvs_key;
    } field_map[] = {
        { "device_id",   NVS_KEY_DEVICE_ID },
        { "llm_key",     NVS_KEY_API_KEY },
        { "llm_backend", NVS_KEY_LLM_BACKEND },
        { "llm_model",   NVS_KEY_LLM_MODEL },
    };

    for (size_t i = 0; i < sizeof(field_map) / sizeof(field_map[0]); i++) {
        const cJSON *item = cJSON_GetObjectItem(json, field_map[i].field);
        if (cJSON_IsString(item) && item->valuestring[0] != '\0') {
            esp_err_t err = memory_set(field_map[i].nvs_key, item->valuestring);
            if (err != ESP_OK) {
                ESP_LOGE(TAG, "Failed to store %s: %s", field_map[i].field, esp_err_to_name(err));
            } else {
                ESP_LOGI(TAG, "Stored %s", field_map[i].field);
            }
        }
    }
    cJSON_Delete(json);

    const char *resp = "{\"status\":\"ok\"}";
    *outbuf = (uint8_t *)strdup(resp);
    if (!*outbuf) {
        return ESP_ERR_NO_MEM;
    }
    *outlen = (ssize_t)strlen(resp);
    return ESP_OK;
}

void ble_prov_run(void)
{
    esp_err_t err;

    err = esp_netif_init();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_ERROR_CHECK(err);
    }
    err = esp_event_loop_create_default();
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_ERROR_CHECK(err);
    }
    esp_netif_create_default_wifi_sta();

    wifi_init_config_t wifi_cfg = WIFI_INIT_CONFIG_DEFAULT();
    err = esp_wifi_init(&wifi_cfg);
    if (err != ESP_OK && err != ESP_ERR_INVALID_STATE) {
        ESP_ERROR_CHECK(err);
    }

    ESP_ERROR_CHECK(esp_event_handler_register(WIFI_PROV_EVENT, ESP_EVENT_ANY_ID,
                                               on_prov_event, NULL));

    wifi_prov_mgr_config_t prov_cfg = {
        .scheme = wifi_prov_scheme_ble,
        // NONE keeps BT memory allocated after provisioning; fine, we reboot anyway.
        .scheme_event_handler = WIFI_PROV_EVENT_HANDLER_NONE,
    };
    ESP_ERROR_CHECK(wifi_prov_mgr_init(prov_cfg));
    ESP_ERROR_CHECK(wifi_prov_mgr_endpoint_create(BLE_PROV_ENDPOINT));

    ESP_LOGI(TAG, "Starting BLE provisioning, service name '%s'", BLE_PROV_SERVICE_NAME);
    ESP_ERROR_CHECK(wifi_prov_mgr_start_provisioning(WIFI_PROV_SECURITY_1, NULL,
                                                     BLE_PROV_SERVICE_NAME, NULL));
    ESP_ERROR_CHECK(wifi_prov_mgr_endpoint_register(BLE_PROV_ENDPOINT, custom_data_handler, NULL));

    // Blocks until provisioning completes (WiFi connected), then reboot so the
    // normal startup path takes over with a clean state.
    wifi_prov_mgr_wait();
    wifi_prov_mgr_deinit();

    ESP_LOGI(TAG, "Provisioning complete, restarting...");
    vTaskDelay(pdMS_TO_TICKS(1000));
    esp_restart();
}

#endif // CONFIG_ZCLAW_BLE_PROVISIONING
