import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { Devices } from '/imports/api/devices/devices.js';
import MeteorCallWrapper from '/imports/services/MeteorCallWrapper.js';
import './settings.html';

Template.Page_settings.onCreated(function () {
  this.deviceId = Template.currentData().deviceId;
  this.subscribe('devices.mine');
  this.busy = new ReactiveVar(false);
  this.error = new ReactiveVar(null);
  this.saved = new ReactiveVar(false);
});

Template.Page_settings.helpers({
  deviceId: () => Template.instance().deviceId,
  device() {
    return Devices.findOne({ deviceId: Template.instance().deviceId }) || {};
  },
  online() {
    const device = Devices.findOne({ deviceId: Template.instance().deviceId });
    return device && device.status === 'online';
  },
  statusLabel(status) {
    if (status === 'online') return 'Online';
    if (status === 'offline') return 'Offline';
    return 'Aguardando conexão';
  },
  busy: () => Template.instance().busy.get(),
  error: () => Template.instance().error.get(),
  saved: () => Template.instance().saved.get(),
});

Template.Page_settings.events({
  'click .js-reset-url'(event, instance) {
    instance.busy.set(true);
    instance.error.set(null);
    instance.saved.set(false);
    // Empty string tells the firmware to erase the override (provider default).
    MeteorCallWrapper.call('devices.updateConfig', {
      deviceId: instance.deviceId,
      llmApiUrl: '',
    })
      .then(() => {
        instance.busy.set(false);
        instance.saved.set(true);
      })
      .catch((err) => {
        instance.busy.set(false);
        instance.error.set(err.reason || 'Não foi possível restaurar a URL.');
      });
  },

  'submit #settings-form'(event, instance) {
    event.preventDefault();
    const form = event.target;
    instance.busy.set(true);
    instance.error.set(null);
    instance.saved.set(false);

    MeteorCallWrapper.call('devices.updateConfig', {
      deviceId: instance.deviceId,
      name: form.name.value,
      llmBackend: form.llmBackend.value || undefined,
      llmModel: form.llmModel.value || undefined,
      llmKey: form.llmKey.value || undefined,
      llmApiUrl: form.llmApiUrl.value.trim() || undefined,
    })
      .then(() => {
        instance.busy.set(false);
        instance.saved.set(true);
        form.llmKey.value = '';
      })
      .catch((err) => {
        instance.busy.set(false);
        instance.error.set(
          err.error === 'device-offline'
            ? 'A placa está offline — as configurações de IA só podem ser enviadas com ela conectada.'
            : err.reason || 'Não foi possível salvar.'
        );
      });
  },
});
