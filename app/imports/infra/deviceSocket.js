// WebSocket broker for zclaw boards. Boards connect to ws://<server>/device-ws,
// authenticate with the deviceId + wsToken pair issued by 'devices.create'
// (delivered to the board over BLE during provisioning), and exchange
// newline-free JSON frames:
//   board -> { type: 'auth', deviceId, token }
//   server -> { type: 'auth_ok' }            (or the socket is closed)
//   server -> { type: 'msg', text }          (user message for the agent)
//   board -> { type: 'msg', text }           (agent reply/event)
// The DDP side stays untouched: the app reads Devices/Messages reactively.
import { Meteor } from 'meteor/meteor';
import { WebApp } from 'meteor/webapp';
import { WebSocketServer } from 'ws';
import { Devices } from '/imports/api/devices/devices.js';
import { Messages } from '/imports/api/messages/messages.js';

const PATH = '/device-ws';
const PING_INTERVAL_MS = 30000;

const sockets = new Map(); // deviceId -> ws

export function sendToDevice(deviceId, text) {
  const ws = sockets.get(deviceId);
  if (!ws || ws.readyState !== ws.OPEN) return false;
  ws.send(JSON.stringify({ type: 'msg', text }));
  return true;
}

async function setStatus(deviceId, status) {
  await Devices.updateAsync(
    { deviceId },
    { $set: { status, lastSeenAt: new Date() } }
  );
}

Meteor.startup(() => {
  const wss = new WebSocketServer({ noServer: true });

  WebApp.httpServer.on('upgrade', (req, socket, head) => {
    if (!req.url || !req.url.startsWith(PATH)) return; // let Meteor/DDP handle it
    wss.handleUpgrade(req, socket, head, (ws) => wss.emit('connection', ws, req));
  });

  wss.on('connection', (ws) => {
    let deviceId = null;
    ws.isAlive = true;
    ws.on('pong', () => {
      ws.isAlive = true;
    });

    ws.on('message', async (raw) => {
      let frame;
      try {
        frame = JSON.parse(raw.toString());
      } catch {
        ws.close(1003, 'invalid json');
        return;
      }

      if (!deviceId) {
        // First frame must be auth.
        if (frame.type !== 'auth' || !frame.deviceId || !frame.token) {
          ws.close(4001, 'auth required');
          return;
        }
        const device = await Devices.findOneAsync({ deviceId: frame.deviceId });
        if (!device || device.wsToken !== frame.token) {
          ws.close(4003, 'bad credentials');
          return;
        }
        deviceId = frame.deviceId;
        // A reconnect replaces any stale socket for the same board.
        const stale = sockets.get(deviceId);
        if (stale && stale !== ws) stale.terminate();
        sockets.set(deviceId, ws);
        await setStatus(deviceId, 'online');
        ws.send(JSON.stringify({ type: 'auth_ok' }));
        return;
      }

      if (frame.type === 'msg' && typeof frame.text === 'string') {
        const device = await Devices.findOneAsync({ deviceId });
        if (!device) return;
        await Messages.insertAsync({
          deviceId,
          userId: device.userId,
          direction: 'fromDevice',
          text: frame.text,
          createdAt: new Date(),
        });
      }
    });

    ws.on('close', async () => {
      if (deviceId && sockets.get(deviceId) === ws) {
        sockets.delete(deviceId);
        await setStatus(deviceId, 'offline');
      }
    });

    ws.on('error', () => ws.terminate());
  });

  const heartbeat = setInterval(() => {
    wss.clients.forEach((ws) => {
      if (!ws.isAlive) {
        ws.terminate();
        return;
      }
      ws.isAlive = false;
      ws.ping();
    });
  }, PING_INTERVAL_MS);
  wss.on('close', () => clearInterval(heartbeat));
});
