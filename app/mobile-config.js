App.info({
  id: 'co.azape.zclaw',
  name: 'zclaw',
  version: '0.1.0',
  buildNumber: '100000',
  description: 'Companion app para placas zclaw',
  author: 'Azape',
});

// Plugin local de provisionamento BLE (instalar com:
//   meteor add cordova:cordova-plugin-zclaw-provisioning@file://plugins/cordova-plugin-zclaw-provisioning
// depois de `meteor add-platform android`/`ios`).

App.accessRule('*');
App.accessRule('*', { type: 'navigation' });

App.setPreference('Orientation', 'portrait');
App.setPreference('android-targetSdkVersion', '35');
App.setPreference('android-minSdkVersion', '23');
App.setPreference('WKWebViewOnly', 'true');
App.setPreference('AndroidLaunchMode', 'singleTask');
