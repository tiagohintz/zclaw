import { FlowRouter } from 'meteor/ostrio:flow-router-extra';
import { Meteor } from 'meteor/meteor';

import '/imports/ui/layouts/layout.js';
import '/imports/ui/pages/login/login.js';
import '/imports/ui/pages/devices/devices.js';
import '/imports/ui/pages/provision/provision.js';
import '/imports/ui/pages/chat/chat.js';
import '/imports/ui/pages/settings/settings.js';

function requireLogin(context, redirect) {
  if (!Meteor.userId() && !Meteor.loggingIn()) {
    redirect('/login');
  }
}

FlowRouter.route('/login', {
  name: 'login',
  action() {
    this.render('Layout', { page: 'Page_login' });
  },
});

FlowRouter.route('/', {
  name: 'devices',
  triggersEnter: [requireLogin],
  action() {
    this.render('Layout', { page: 'Page_devices' });
  },
});

FlowRouter.route('/provision', {
  name: 'provision',
  triggersEnter: [requireLogin],
  action() {
    this.render('Layout', { page: 'Page_provision' });
  },
});

FlowRouter.route('/device/:deviceId/settings', {
  name: 'settings',
  triggersEnter: [requireLogin],
  action(params) {
    this.render('Layout', { page: 'Page_settings', deviceId: params.deviceId });
  },
});

FlowRouter.route('/chat/:deviceId', {
  name: 'chat',
  triggersEnter: [requireLogin],
  action(params) {
    this.render('Layout', { page: 'Page_chat', deviceId: params.deviceId });
  },
});
