import { Meteor } from 'meteor/meteor';
import { check, Match } from 'meteor/check';
import { Random } from 'meteor/random';
import { Devices } from './devices.js';
import { sendFrameToDevice } from '/imports/infra/deviceSocket.js';

const LLM_BACKENDS = ['anthropic', 'openai', 'openrouter', 'ollama'];

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

  // Edits settings of an already-connected board. `name` persists in Devices;
  // LLM fields are relayed to the board over websocket (never stored server-side)
  // and require the board to be online.
  async 'devices.updateConfig'(token, { deviceId, name, llmBackend, llmKey, llmModel }) {
    check(deviceId, String);
    check(name, Match.Maybe(String));
    check(llmBackend, Match.Maybe(Match.OneOf(...LLM_BACKENDS)));
    check(llmKey, Match.Maybe(String));
    check(llmModel, Match.Maybe(String));
    if (!this.userId) throw new Meteor.Error('not-authorized');

    const device = await Devices.findOneAsync({ deviceId, userId: this.userId });
    if (!device) throw new Meteor.Error('not-found');

    if (name && name.trim() && name.trim() !== device.name) {
      await Devices.updateAsync(device._id, { $set: { name: name.trim() } });
    }

    const frame = { type: 'config' };
    if (llmBackend) frame.llm_backend = llmBackend;
    if (llmKey && llmKey.trim()) frame.llm_key = llmKey.trim();
    if (llmModel && llmModel.trim()) frame.llm_model = llmModel.trim();

    if (Object.keys(frame).length > 1) {
      if (device.status !== 'online') throw new Meteor.Error('device-offline');
      if (!sendFrameToDevice(deviceId, frame)) throw new Meteor.Error('device-offline');
    }
  },

  async 'devices.remove'(token, { deviceId }) {
    check(deviceId, String);
    if (!this.userId) throw new Meteor.Error('not-authorized');

    const device = await Devices.findOneAsync({ deviceId, userId: this.userId });
    if (!device) throw new Meteor.Error('not-found');
    return Devices.removeAsync(device._id);
  },
});
