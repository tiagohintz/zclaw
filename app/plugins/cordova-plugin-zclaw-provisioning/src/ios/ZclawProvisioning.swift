import Foundation

// Native side of the zclaw provisioning plugin (iOS).
//
// TODO(fase nativa): implementar sobre o pod ESPProvision:
//  - connect: ESPProvisionManager.searchESPDevices(prefix) + connect(secure: .secure, pop: "")
//  - sendCustomData: espDevice.sendData(path: endpoint, data:)
//  - sendWifi: espDevice.provision(ssid:passPhrase:completionHandler:)
// Contrato JS em www/EspProvisioning.js; contrato BLE em docs/FORK.md.
@objc(ZclawProvisioning)
class ZclawProvisioning: CDVPlugin {
  @objc(connect:)
  func connect(_ command: CDVInvokedUrlCommand) { notImplemented(command) }

  @objc(sendCustomData:)
  func sendCustomData(_ command: CDVInvokedUrlCommand) { notImplemented(command) }

  @objc(sendWifi:)
  func sendWifi(_ command: CDVInvokedUrlCommand) { notImplemented(command) }

  @objc(disconnect:)
  func disconnect(_ command: CDVInvokedUrlCommand) { notImplemented(command) }

  private func notImplemented(_ command: CDVInvokedUrlCommand) {
    let result = CDVPluginResult(status: .error,
                                 messageAs: "not implemented: native provisioning layer pending")
    commandDelegate.send(result, callbackId: command.callbackId)
  }
}
