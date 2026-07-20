import { Meteor } from 'meteor/meteor';
import { Template } from 'meteor/templating';
import { Devices } from '/imports/api/devices/devices.js';
import { Messages } from '/imports/api/messages/messages.js';
import MeteorCallWrapper from '/imports/services/MeteorCallWrapper.js';
import './chat.html';

function scrollToBottom() {
  const el = document.getElementById('chat-scroll');
  if (el) el.scrollTop = el.scrollHeight;
}

Template.Page_chat.onCreated(function () {
  this.deviceId = Template.currentData().deviceId;
  this.subscribe('devices.mine');
  this.subscribe('messages.forDevice', this.deviceId, 100);
});

Template.Page_chat.onRendered(function () {
  // Keep the newest message in view as DDP delivers updates.
  this.autorun(() => {
    Messages.find({ deviceId: this.deviceId }).count();
    Meteor.setTimeout(scrollToBottom, 50);
  });
});

Template.Page_chat.helpers({
  loading() {
    return !Template.instance().subscriptionsReady();
  },
  device() {
    return Devices.findOne({ deviceId: Template.instance().deviceId }) || {};
  },
  messages() {
    return Messages.find(
      { deviceId: Template.instance().deviceId },
      { sort: { createdAt: 1 } }
    ).fetch();
  },
  canSend() {
    const device = Devices.findOne({ deviceId: Template.instance().deviceId });
    return device && device.status === 'online';
  },
  composerPlaceholder() {
    const device = Devices.findOne({ deviceId: Template.instance().deviceId });
    return device && device.status === 'online'
      ? 'Mande uma mensagem…'
      : 'Placa offline — aguardando conexão';
  },
});

Template.Page_chat.events({
  'submit #chat-form'(event, instance) {
    event.preventDefault();
    const input = event.target.text;
    const text = input.value.trim();
    if (!text) return;
    input.value = '';
    MeteorCallWrapper.call('messages.send', { deviceId: instance.deviceId, text }).catch(() => {
      input.value = text; // devolve o texto se falhar
    });
  },
});
