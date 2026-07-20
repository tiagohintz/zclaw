# Objetivo deste fork (tiagohintz/zclaw)

Fork de [tnm/zclaw](https://github.com/tnm/zclaw) com um único recurso adicional:
**provisionamento via BLE por app companion (Cordova)**, no lugar do
provisionamento serial (`./scripts/provision.sh`) do upstream.

Fluxo do produto: o usuário liga a placa, abre o app no celular, o app encontra
o dispositivo por BLE e envia WiFi + identificação + credenciais do LLM. Sem
cabo USB, sem terminal.

## O que muda em relação ao upstream

| Arquivo | Mudança |
| --- | --- |
| `main/ble_prov.c/.h` | Novo módulo: provisionamento BLE (WiFi + dados do app) |
| `main/main.c` | Quando não provisionado, chama `ble_prov_run()` em vez de só imprimir ajuda serial |
| `main/Kconfig.projbuild` | Opção `ZCLAW_BLE_PROVISIONING` (default `y` quando BT habilitado) |
| `main/nvs_keys.h` | Nova chave `device_id` |
| `sdkconfig.defaults` | Habilita BT + NimBLE |
| `main/CMakeLists.txt` | Componentes `wifi_provisioning` e `bt` |

O recurso é opt-in por Kconfig: perfis sem BT (QEMU, testes, upstream default)
compilam sem nada disso — `ble_prov.c` vira uma unidade vazia.

**Tamanho**: com NimBLE o binário passa do orçamento de 888 KiB do upstream
(que vale só para o build default deles), mas cabe com folga na partição OTA de
1472 KiB (`partitions.csv`).

## Contrato BLE (para o app Cordova)

O app ainda não existe neste repositório; este é o contrato que o firmware
expõe e que o app deve implementar.

- **Advertising / service name**: `PROV_ZCLAW`
- **Protocolo**: ESP-IDF `wifi_provisioning` (protocomm), transporte BLE
- **Segurança**: `WIFI_PROV_SECURITY_1` sem proof-of-possession (PoP vazio)
- **WiFi**: enviado pelo fluxo padrão do protocolo (endpoint `prov-config`);
  qualquer lib/plugin compatível com "ESP BLE Provisioning" serve
- **Endpoint customizado**: `custom-data`, payload JSON com campos string,
  todos opcionais:

```json
{
  "device_id": "identificador do dispositivo no ecossistema do app",
  "llm_key": "chave de API do provedor LLM",
  "llm_backend": "anthropic | openai | openrouter | ollama",
  "llm_model": "modelo (opcional, usa default do firmware se ausente)",
  "llm_api_url": "URL customizada da API (opcional; base tipo https://gw.exemplo/v1 — o firmware anexa /messages ou /chat/completions conforme o provedor — ou URL completa)",
  "ws_url": "wss://servidor/device-ws (canal websocket do app; fase firmware pendente)",
  "ws_token": "credencial emitida por devices.create no servidor do app"
}
```

Resposta do endpoint: `{"status":"ok"}`.

> Envie `llm_backend` junto com `llm_key`: sem a chave `llm_backend` no NVS o
> firmware assume OpenAI.

### Onde os dados são gravados (NVS, namespace `zclaw`)

| Campo do app | Chave NVS | Quem lê |
| --- | --- | --- |
| SSID/senha (fluxo WiFi) | `wifi_ssid` / `wifi_pass` | `device_is_configured()`, conexão WiFi |
| `device_id` | `device_id` | reservado para o app/relay |
| `llm_key` | `api_key` | `llm_init()` |
| `llm_backend` | `llm_backend` | `llm_init()` |
| `llm_model` | `llm_model` | `llm_init()` |
| `llm_api_url` | `llm_api_url` | `llm_init()` — override da URL para qualquer provedor |
| `ws_url` | `ws_url` | canal WS do firmware (`ws_channel.c`) |
| `ws_token` | `ws_token` | canal WS do firmware (`ws_channel.c`) |

Os mesmos campos de LLM (incluindo `llm_api_url`) também podem ser alterados
depois, com a placa conectada, via frame websocket `{"type":"config", ...}` —
string vazia apaga a chave (volta ao padrão do provedor).

O app companion (Meteor 3 + Blaze + Cordova) vive em [`app/`](../app/README.md):
broker websocket em `/device-ws`, collections `Devices`/`Messages`, plugin BLE
em `app/plugins/`.

### Sequência

1. Placa sem `wifi_ssid` no NVS → anuncia `PROV_ZCLAW` e aguarda.
2. App conecta, manda o JSON no endpoint `custom-data` (gravado na hora).
3. App manda credenciais WiFi pelo fluxo padrão; o firmware testa a conexão.
4. Conexão OK → credenciais persistidas nas chaves do zclaw → reboot → boot
   normal (WiFi + Telegram + agente).
5. Senha errada / AP não encontrado → reboot de volta ao modo de
   provisionamento; o app só precisa tentar de novo.

Console serial local (`/wifi`, `/diag`, `/factory-reset`, …) continua
disponível durante o provisionamento.

## Histórico

A primeira versão deste recurso viveu como mudanças não commitadas no worktree
principal e tinha dois defeitos corrigidos nesta versão:

1. WiFi ficava salvo apenas no NVS do driver (`wifi_prov_mgr`); o zclaw decide
   se está provisionado lendo as próprias chaves (`wifi_ssid`), então após o
   reboot a placa voltava ao modo de provisionamento para sempre.
2. `llm_key`/`device_id` eram gravados no namespace `zclaw_config`, que nenhum
   código do firmware lê (o firmware usa `zclaw`/`api_key`).

## Sincronizando com o upstream

```bash
git fetch upstream
git merge upstream/main   # conflitos esperados: só nos pontos da tabela acima
./scripts/test.sh host && ./scripts/build.sh
```
