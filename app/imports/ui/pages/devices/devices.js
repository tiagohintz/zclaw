import { Template } from 'meteor/templating';
import { Meteor } from 'meteor/meteor';
import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Devices } from '/imports/api/devices/devices.js';
import './devices.html';

Template.Page_devices.onCreated(function () {
  this.subscribe('devices.mine');
});

Template.Page_devices.helpers({
  loading() {
    return !Template.instance().subscriptionsReady();
  },
  devices() {
    return Devices.find({}, { sort: { createdAt: -1 } }).fetch();
  },
  statusLabel(status) {
    if (status === 'online') return 'Online';
    if (status === 'offline') return 'Offline';
    return 'Aguardando conexão';
  },
});

Template.Page_devices.events({
  'click .js-logout'() {
    Meteor.logout(() => FlowRouter.go('/login'));
  },
});
