import { Meteor } from 'meteor/meteor';
import { Devices } from './devices.js';

Meteor.publish('devices.mine', function () {
  if (!this.userId) return this.ready();
  // wsToken stays server-side: it is the board's credential, not the app's.
  return Devices.find({ userId: this.userId }, { fields: { wsToken: 0 } });
});
