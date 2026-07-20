import Foundation
import ESPProvision

// Native side of the zclaw provisioning plugin (iOS), over the official
// ESPProvision pod. JS contract in www/EspProvisioning.js; BLE contract
// (service PROV_ZCLAW, Security1 empty PoP, endpoint custom-data) in docs/FORK.md.
@objc(ZclawProvisioning)
class ZclawProvisioning: CDVPlugin {

  private var espDevice: ESPDevice?

  @objc(connect:)
  func connect(_ command: CDVInvokedUrlCommand) {
    guard let prefix = command.arguments[0] as? String else {
      return fail(command, "prefixo inválido")
    }
    ESPProvisionManager.shared.searchESPDevices(
      devicePrefix: prefix, transport: .ble, security: .secure
    ) { devices, error in
      guard let device = devices?.first else {
        return self.fail(command, "nenhum dispositivo '\(prefix)' encontrado: \(error?.description ?? "")")
      }
      device.security = .secure
      device.proofOfPossession = ""
      device.connect { status in
        switch status {
        case .connected:
          self.espDevice = device
          self.ok(command)
        case .failedToConnect(let err):
          self.fail(command, "conexão BLE falhou: \(err.description)")
        case .disconnected:
          self.fail(command, "dispositivo desconectou")
        }
      }
    }
  }

  @objc(sendCustomData:)
  func sendCustomData(_ command: CDVInvokedUrlCommand) {
    guard let device = espDevice,
          let endpoint = command.arguments[0] as? String,
          let json = command.arguments[1] as? String,
          let data = json.data(using: .utf8) else {
      return fail(command, "não conectado ou argumentos inválidos")
    }
    device.sendData(path: endpoint, data: data) { response, error in
      if let error = error {
        return self.fail(command, "custom-data falhou: \(error.description)")
      }
      let text = response.flatMap { String(data: $0, encoding: .utf8) } ?? ""
      self.ok(command, message: text)
    }
  }

  @objc(sendWifi:)
  func sendWifi(_ command: CDVInvokedUrlCommand) {
    guard let device = espDevice,
          let ssid = command.arguments[0] as? String,
          let pass = command.arguments[1] as? String else {
      return fail(command, "não conectado ou argumentos inválidos")
    }
    device.provision(ssid: ssid, passPhrase: pass) { status in
      switch status {
      case .success:
        self.ok(command)
      case .failure(let err):
        self.fail(command, "provisionamento falhou: \(err.description)")
      case .configApplied:
        break // intermediate state; wait for success/failure
      }
    }
  }

  @objc(disconnect:)
  func disconnect(_ command: CDVInvokedUrlCommand) {
    espDevice?.disconnect()
    espDevice = nil
    ok(command)
  }

  private func ok(_ command: CDVInvokedUrlCommand, message: String? = nil) {
    let result = message != nil
      ? CDVPluginResult(status: .ok, messageAs: message)
      : CDVPluginResult(status: .ok)
    commandDelegate.send(result, callbackId: command.callbackId)
  }

  private func fail(_ command: CDVInvokedUrlCommand, _ message: String) {
    commandDelegate.send(CDVPluginResult(status: .error, messageAs: message),
                         callbackId: command.callbackId)
  }
}
