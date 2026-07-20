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
`window.EspProvisioning` (connect/sendCustomData/sendWifi). A camada nativa
Android usa o SDK oficial `esp-idf-provisioning-android` (build validado);
a iOS usa o pod `ESPProvision` (compilar exige assinatura/Xcode).

## Estado

- Firmware: canal websocket implementado (`main/ws_channel.c`) e validado em
  hardware — placa autentica no broker, troca mensagens e executa tools.
- UI (Meteor 3.5 + Blaze, identidade Azape): login/cadastro, lista de placas
  com status ao vivo, wizard de provisionamento BLE e chat reativo.
- E2E validado: UI → método → broker → ESP32 → agente → resposta → UI.

## Pendências

1. Testar o fluxo BLE do app num telefone físico (`meteor run android-device`).
2. Assinatura/publicação (keystore Android, provisioning profile iOS).
