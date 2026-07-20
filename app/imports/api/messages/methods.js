import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Devices } from '../devices/devices.js';
import { Messages } from './messages.js';
import { sendToDevice } from '/imports/infra/deviceSocket.js';

Meteor.methods({
  async 'messages.send'(token, { deviceId, text }) {
    check(deviceId, String);
    check(text, String);
    if (!this.userId) throw new Meteor.Error('not-authorized');
    if (!text.trim()) throw new Meteor.Error('empty-message');

    const device = await Devices.findOneAsync({ deviceId, userId: this.userId });
    if (!device) throw new Meteor.Error('not-found');
    if (device.status !== 'online') throw new Meteor.Error('device-offline');

    await Messages.insertAsync({
      deviceId,
      userId: this.userId,
      direction: 'toDevice',
      text,
      createdAt: new Date(),
    });
    sendToDevice(deviceId, text);
  },
});
