import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { ReactiveVar } from 'meteor/reactive-var';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import DeviceProvisioningService from '/imports/services/DeviceProvisioningService.js';
import './provision.html';

function wsUrlFromServer() {
  const url = new URL(Meteor.absoluteUrl());
  const proto = url.protocol === 'https:' ? 'wss:' : 'ws:';
  return `${proto}//${url.host}/device-ws`;
}

Template.Page_provision.onCreated(function () {
  this.provisioning = new ReactiveVar(false);
  this.stepLabel = new ReactiveVar('');
  this.error = new ReactiveVar(null);
});

Template.Page_provision.helpers({
  provisioning: () => Template.instance().provisioning.get(),
  stepLabel: () => Template.instance().stepLabel.get(),
  error: () => Template.instance().error.get(),
  bleAvailable: () => DeviceProvisioningService.isAvailable(),
});

Template.Page_provision.events({
  async 'submit #prov-form'(event, instance) {
    event.preventDefault();
    const form = event.target;
    instance.error.set(null);
    instance.provisioning.set(true);
    instance.stepLabel.set('Procurando a placa por Bluetooth…');

    try {
      await DeviceProvisioningService.provision({
        name: form.name.value.trim(),
        ssid: form.ssid.value.trim(),
        password: form.wifiPassword.value,
        llmKey: form.llmKey.value.trim(),
        llmBackend: form.llmBackend.value,
        wsUrl: wsUrlFromServer(),
      });
      FlowRouter.go('/');
    } catch (err) {
      instance.provisioning.set(false);
      instance.error.set(err.message || 'Falha no provisionamento. Tente novamente.');
    }
  },
});
