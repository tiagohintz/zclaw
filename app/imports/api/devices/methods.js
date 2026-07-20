import { Meteor } from 'meteor/meteor';
import { check } from 'meteor/check';
import { Random } from 'meteor/random';
import { Devices } from './devices.js';

Meteor.methods({
  // Called BEFORE BLE provisioning: registers the board and returns the
  // credentials the app must send over BLE (device_id + ws_token).
  async 'devices.create'(token, { name }) {
    check(name, String);
    if (!this.userId) throw new Meteor.Error('not-authorized');

    const deviceId = Random.id();
    const wsToken = Random.secret();
    await Devices.insertAsync({
      deviceId,
      wsToken,
      userId: this.userId,
      name,
      status: 'unprovisioned',
      lastSeenAt: null,
      createdAt: new Date(),
    });
    return { deviceId, wsToken };
  },

  async 'devices.rename'(token, { deviceId, name }) {
    check(deviceId, String);
    check(name, String);
    if (!this.userId) throw new Meteor.Error('not-authorized');

    const device = await Devices.findOneAsync({ deviceId, userId: this.userId });
    if (!device) throw new Meteor.Error('not-found');
    return Devices.updateAsync(device._id, { $set: { name } });
  },

  async 'devices.remove'(token, { deviceId }) {
    check(deviceId, String);
    if (!this.userId) throw new Meteor.Error('not-authorized');

    const device = await Devices.findOneAsync({ deviceId, userId: this.userId });
    if (!device) throw new Meteor.Error('not-found');
    return Devices.removeAsync(device._id);
  },
});
