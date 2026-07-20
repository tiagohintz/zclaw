import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Messages } from './messages.js';

Meteor.publish('messages.forDevice', function (deviceId, limit = 50) {
  check(deviceId, String);
  check(limit, Number);
  if (!this.userId) return this.ready();
  return Messages.find(
    { deviceId, userId: this.userId },
    { sort: { createdAt: -1 }, limit: Math.min(limit, 200) }
  );
});
