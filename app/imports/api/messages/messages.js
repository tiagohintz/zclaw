import { Mongo } from 'meteor/mongo';

// Chat history between a user and one of their boards.
// { deviceId, userId, direction: 'toDevice'|'fromDevice', text, createdAt }
export const Messages = new Mongo.Collection('messages');
