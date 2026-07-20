#include "ws_channel.h"
#include "config.h"
#include "memory.h"
#include "messages.h"
#include "nvs_keys.h"

#include <string.h>
#include "cJSON.h"
#include "esp_crt_bundle.h"
#include "llm.h"
#include "esp_log.h"
#include "esp_websocket_client.h"
#include "freertos/task.h"

#define WS_MAX_OUT_LEN     2048  // ponytail: respostas maiores são truncadas; subir se o agente passar disso
#define WS_OUT_QUEUE_LEN   4
#define WS_RECONNECT_MS    10000
#define WS_SEND_TIMEOUT_MS 5000

static const char *TAG = "ws_channel";

typedef struct {
    char text[WS_MAX_OUT_LEN];
} ws_out_msg_t;

static void handle_config_frame(const cJSON *json);

static esp_websocket_client_handle_t s_client;
static QueueHandle_t s_input_queue;
static QueueHandle_t s_out_queue;
static bool s_authed;
static char s_device_id[64];
static char s_ws_token[96];

bool ws_channel_is_configured(void)
{
    char url[160], token[96], device_id[64];
    return memory_get(NVS_KEY_WS_URL, url, sizeof(url)) && url[0] != '\0' &&
           memory_get(NVS_KEY_WS_TOKEN, token, sizeof(token)) && token[0] != '\0' &&
           memory_get(NVS_KEY_DEVICE_ID, device_id, sizeof(device_id)) && device_id[0] != '\0';
}

static void send_json(cJSON *json)
{
    char *payload = cJSON_PrintUnformatted(json);
    cJSON_Delete(json);
    if (!payload) {
        return;
    }
    int sent = esp_websocket_client_send_text(s_client, payload, strlen(payload),
                                              pdMS_TO_TICKS(WS_SEND_TIMEOUT_MS));
    if (sent < 0) {
        ESP_LOGW(TAG, "send failed");
    }
    free(payload);
}

static void send_auth_frame(void)
{
    cJSON *json = cJSON_CreateObject();
    if (!json) {
        return;
    }
    cJSON_AddStringToObject(json, "type", "auth");
    cJSON_AddStringToObject(json, "deviceId", s_device_id);
    cJSON_AddStringToObject(json, "token", s_ws_token);
    send_json(json);
}

static void handle_frame(const char *data, size_t len)
{
    cJSON *json = cJSON_ParseWithLength(data, len);
    if (!json) {
        ESP_LOGW(TAG, "invalid frame");
        return;
    }

    const cJSON *type = cJSON_GetObjectItem(json, "type");
    if (cJSON_IsString(type) && strcmp(type->valuestring, "auth_ok") == 0) {
        s_authed = true;
        ESP_LOGI(TAG, "authenticated with app server");
    } else if (cJSON_IsString(type) && strcmp(type->valuestring, "config") == 0) {
        handle_config_frame(json);
    } else if (cJSON_IsString(type) && strcmp(type->valuestring, "msg") == 0) {
        const cJSON *text = cJSON_GetObjectItem(json, "text");
        if (cJSON_IsString(text) && text->valuestring[0] != '\0' && s_input_queue) {
            channel_msg_t msg = {0};
            strncpy(msg.text, text->valuestring, CHANNEL_RX_BUF_SIZE - 1);
            msg.source = MSG_SOURCE_WEBSOCKET;
            msg.chat_id = 0;
            if (xQueueSend(s_input_queue, &msg, pdMS_TO_TICKS(1000)) != pdTRUE) {
                ESP_LOGW(TAG, "input queue full, dropping message");
            }
        }
    }
    cJSON_Delete(json);
}

// App-pushed settings update: {"type":"config","llm_backend"?,"llm_key"?,"llm_model"?}
// Values land in the same NVS keys BLE provisioning uses; llm_init() re-reads
// them so the change applies without reboot. Replies with config_ok/config_err.
static void handle_config_frame(const cJSON *json)
{
    static const struct {
        const char *field;
        const char *nvs_key;
    } field_map[] = {
        { "llm_key",     NVS_KEY_API_KEY },
        { "llm_backend", NVS_KEY_LLM_BACKEND },
        { "llm_model",   NVS_KEY_LLM_MODEL },
    };

    bool changed = false;
    bool failed = false;
    for (size_t i = 0; i < sizeof(field_map) / sizeof(field_map[0]); i++) {
        const cJSON *item = cJSON_GetObjectItem(json, field_map[i].field);
        if (cJSON_IsString(item) && item->valuestring[0] != '\0') {
            if (memory_set(field_map[i].nvs_key, item->valuestring) == ESP_OK) {
                ESP_LOGI(TAG, "config: updated %s", field_map[i].field);
                changed = true;
            } else {
                ESP_LOGE(TAG, "config: failed to store %s", field_map[i].field);
                failed = true;
            }
        }
    }

    if (changed) {
        // ponytail: llm_init() re-reads NVS on the ws task; a request already
        // in flight on the agent task may fail once during the swap.
        esp_err_t err = llm_init();
        if (err != ESP_OK) {
            ESP_LOGE(TAG, "config: llm re-init failed: %s", esp_err_to_name(err));
            failed = true;
        }
    }

    cJSON *reply = cJSON_CreateObject();
    if (reply) {
        cJSON_AddStringToObject(reply, "type", failed ? "config_err" : "config_ok");
        send_json(reply);
    }
}

static void ws_event_handler(void *arg, esp_event_base_t base, int32_t event_id, void *event_data)
{
    (void)arg;
    (void)base;
    esp_websocket_event_data_t *data = (esp_websocket_event_data_t *)event_data;

    switch (event_id) {
    case WEBSOCKET_EVENT_CONNECTED:
        ESP_LOGI(TAG, "connected, authenticating...");
        s_authed = false;
        send_auth_frame();
        break;
    case WEBSOCKET_EVENT_DISCONNECTED:
        s_authed = false;
        ESP_LOGW(TAG, "disconnected (auto-reconnect active)");
        break;
    case WEBSOCKET_EVENT_DATA:
        // ponytail: assumes single-fragment text frames (<1KB from the broker);
        // add reassembly if the app ever sends larger payloads.
        if (data->op_code == 0x1 && data->data_len > 0 &&
            data->payload_offset == 0 && data->data_len == data->payload_len) {
            handle_frame(data->data_ptr, (size_t)data->data_len);
        }
        break;
    default:
        break;
    }
}

static void ws_sender_task(void *arg)
{
    (void)arg;
    ws_out_msg_t msg;
    while (1) {
        if (xQueueReceive(s_out_queue, &msg, portMAX_DELAY) != pdTRUE) {
            continue;
        }
        if (!s_client || !esp_websocket_client_is_connected(s_client) || !s_authed) {
            continue; // drop: app is offline; history lives on the server side
        }
        cJSON *json = cJSON_CreateObject();
        if (!json) {
            continue;
        }
        cJSON_AddStringToObject(json, "type", "msg");
        cJSON_AddStringToObject(json, "text", msg.text);
        send_json(json);
    }
}

void ws_channel_send(const char *text)
{
    if (!s_out_queue || !text || text[0] == '\0') {
        return;
    }
    ws_out_msg_t msg;
    strncpy(msg.text, text, WS_MAX_OUT_LEN - 1);
    msg.text[WS_MAX_OUT_LEN - 1] = '\0';
    if (xQueueSend(s_out_queue, &msg, 0) != pdTRUE) {
        ESP_LOGW(TAG, "out queue full, dropping response");
    }
}

esp_err_t ws_channel_start(QueueHandle_t input_queue)
{
    char url[160] = {0};
    if (!memory_get(NVS_KEY_WS_URL, url, sizeof(url)) || url[0] == '\0' ||
        !memory_get(NVS_KEY_DEVICE_ID, s_device_id, sizeof(s_device_id)) ||
        !memory_get(NVS_KEY_WS_TOKEN, s_ws_token, sizeof(s_ws_token))) {
        return ESP_ERR_NOT_FOUND;
    }
    if (!input_queue) {
        return ESP_ERR_INVALID_ARG;
    }
    s_input_queue = input_queue;

    s_out_queue = xQueueCreate(WS_OUT_QUEUE_LEN, sizeof(ws_out_msg_t));
    if (!s_out_queue) {
        return ESP_ERR_NO_MEM;
    }

    esp_websocket_client_config_t cfg = {
        .uri = url,
        .reconnect_timeout_ms = WS_RECONNECT_MS,
        .network_timeout_ms = 10000,
        .crt_bundle_attach = esp_crt_bundle_attach, // enables wss://
    };
    s_client = esp_websocket_client_init(&cfg);
    if (!s_client) {
        return ESP_FAIL;
    }
    esp_websocket_register_events(s_client, WEBSOCKET_EVENT_ANY, ws_event_handler, NULL);

    esp_err_t err = esp_websocket_client_start(s_client);
    if (err != ESP_OK) {
        ESP_LOGE(TAG, "start failed: %s", esp_err_to_name(err));
        return err;
    }

    if (xTaskCreate(ws_sender_task, "ws_send", 4096, NULL, 5, NULL) != pdPASS) {
        return ESP_ERR_NO_MEM;
    }

    ESP_LOGI(TAG, "websocket channel started -> %s", url);
    return ESP_OK;
}
