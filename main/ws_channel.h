#ifndef WS_CHANNEL_H
#define WS_CHANNEL_H

#include "esp_err.h"
#include "freertos/FreeRTOS.h"
#include "freertos/queue.h"
#include <stdbool.h>

// Companion-app websocket channel. The board connects OUT to the app's Meteor
// server (ws_url from NVS), authenticates with device_id + ws_token, and
// exchanges JSON frames: {"type":"auth"|"auth_ok"|"msg", ...}.
// Protocol counterpart: app/imports/infra/deviceSocket.js.

// True when ws_url, ws_token and device_id all exist in NVS.
bool ws_channel_is_configured(void);

// Connect and start the channel (returns ESP_ERR_NOT_FOUND when unconfigured).
esp_err_t ws_channel_start(QueueHandle_t input_queue);

// Queue an outbound message to the app (no-op when the channel is not running).
void ws_channel_send(const char *text);

#endif // WS_CHANNEL_H
