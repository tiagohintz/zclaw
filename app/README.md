# zclaw companion app

App Meteor 3 + Blaze (padrão meteor-blaze-app) que faz o onboarding das placas
zclaw via BLE e conversa com elas via websocket através deste servidor.

## Arquitetura

```
celular (Cordova)                 servidor Meteor                    placa zclaw
┌──────────────────┐   DDP    ┌──────────────────────┐   WS       ┌────────────┐
│ Blaze UI         │◄────────►│ methods/publications │◄──────────►│ canal WS   │
│ + plugin BLE ────┼─ BLE ────┼──────────────────────┼─(fase fw)──│ (a criar)  │
└──────────────────┘ provisão │ /device-ws broker    │            └────────────┘
                              └──────────────────────┘
```

- **Onboarding**: `devices.create` gera `deviceId` + `wsToken` → o app envia por
  BLE (endpoint `custom-data`) junto com WiFi, chave LLM e `ws_url` do servidor.
  Contrato BLE completo em [../docs/FORK.md](../docs/FORK.md).
- **Broker WS**: placas conectam em `wss://<servidor>/device-ws`
  ([imports/infra/deviceSocket.js](imports/infra/deviceSocket.js)); frames JSON
  `{type: 'auth'|'msg', ...}`. Status online/offline e histórico ficam nas
  collections `Devices`/`Messages`, que a UI lê reativamente via DDP.
- **Auth**: accounts-password do Meteor; todo dado é escopado por `userId`.

## Domínios (imports/api/)

| Domínio | Tipo | Conteúdo |
| --- | --- | --- |
| `devices` | interno | placas do usuário; `devices.create` emite credenciais WS |
| `messages` | interno | chat usuário ↔ placa; `messages.send` roteia pelo broker |

## Rodar

```bash
cd app
meteor npm install
meteor run
```

## Mobile (Cordova)

```bash
meteor add-platform android   # e/ou ios
meteor add cordova:cordova-plugin-zclaw-provisioning@file://plugins/cordova-plugin-zclaw-provisioning
meteor run android-device
```

O plugin em `plugins/cordova-plugin-zclaw-provisioning/` expõe
`window.EspProvisioning` (connect/sendCustomData/sendWifi). **A camada nativa
ainda é stub** — implementar sobre os SDKs oficiais da Espressif
(instruções nos TODOs de `src/android/` e `src/ios/`).

## Pendências (em ordem)

1. Camada nativa do plugin BLE (Android primeiro; a placa já responde ao
   protocolo — validada com o app oficial da Espressif).
2. Canal websocket no firmware (C): conectar em `ws_url` com
   `deviceId`+`ws_token` vindos do BLE — campos já previstos no contrato.
3. UI (login, lista de devices, fluxo de provisionamento, chat) — usar o skill
   meteor-blaze-site.
