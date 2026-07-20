import { Mongo } from 'meteor/mongo';

// One document per zclaw board owned by a user.
// { deviceId, wsToken, userId, name, status: 'online'|'offline'|'unprovisioned',
//   lastSeenAt, createdAt }
export const Devices = new Mongo.Collection('devices');
