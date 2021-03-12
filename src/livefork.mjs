/**
 * Copyright (c) 2018 DenMSC
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { LZString } from './lib/lzstring.mjs';
import { createUuid } from './lib/uuid.mjs';
import { createLogger } from './lib/logger.mjs';
import { WfMaster } from './store/wfmaster.mjs';
import { WfServer } from './store/wfserver.mjs';
import { WfPlayer } from './store/wfplayer.mjs';
import { Action } from './store/eventlog.mjs';

const logger = createLogger('Livefork');

const DEFAULT_INTERVAL = 1000;
const MIN_INTERVAL = 1000;
const MAX_INTERVAL = 100000;

const clients = new Set();

/*
* Client
*/

class Client {
  constructor(ws) {
    this.id = createUuid();
    this.ws = ws;
    this.ready = false;
    this.lzString = false;
    this.timeOffset = 0;

    this.timeout = null;
    this.interval = DEFAULT_INTERVAL;
    this.lastAction;
  }

  toString() {
    return `[${this.id.substr(0, 7)}]`;
  }

  sendMessage(type, payload) {
    const time = Date.now() + this.timeOffset;
    const msg = JSON.stringify({type, payload, time})
    if (this.lzString) {
      this.ws.send(LZString.compressToBase64(msg));
    } else {
      this.ws.send(msg);
    }
  }

  sendUpdates() {
    if (!this.ready) {
      return;
    }
    this.sendMessage('UPDATE', liveforkGetUpdate(this));

    this.setInterval();
  }

  setInterval() {
    this.timeout = setTimeout(() => {
      this.sendUpdates();
    }, this.interval);
  }

  static create(ws) {
    const client = new Client(ws);
    clients.add(client);
    return client;
  }

  static delete(client) {
    clearTimeout(client.timeout);
    clients.delete(client);
  }
}

/*
* Connections
*/

export function acceptConnection(ws) {
  const client = Client.create(ws);
  logger.log(`Client ${client} connected | ${clients.size} connected`);
  ws.on('message', (msgStr) => {
    let msg;
    try {
      msg = JSON.parse(msgStr);
    } catch (e) {
      logger.log(`Faulty message from ${client}`);
      //ws.close();
      return;
    }
    const res = handleMessage(client, msg);
    if (res) {
      client.send(res);
    }
  });
  ws.on('close', () => {
    Client.delete(client);
    logger.log(`Client ${client} disconnected | ${clients.size} connected`);
  })
}

function handleMessage(client, msg) {
  const { type, payload, time } = msg;
  if (type === 'READY') {
    logger.log(`Client ${client} is ready`);
    client.ready = true;
    client.timeOffset = Date.now() - (time||Date.now());
    client.sendMessage('INIT', liveforkGetInit());
    client.lastAction = Action.getLastAction();
    client.setInterval();
    return;
  }
  if (type === 'ACCEPT_LZ_STRING') {
    logger.log(`Client ${client} is accepting lz-string`);
    client.lzString = true;
    return;
  }
  if (type === 'FILTER') {
    logger.log(`Client ${client} sent filter ${payload}`);
    return;
  }
  if (type === 'INTERVAL') {
    // clamp interval
    client.interval = Math.min(Math.max(payload.interval, MIN_INTERVAL), MAX_INTERVAL);
    logger.log(`Client ${client} set interval of ${client.interval}`);
    return;
  }
  logger.log(`Unhandled message from ${client}: ${msg}`);
}

/*
* LiveFork
*/

export function initializeLivefork() {
  const master = new WfMaster();
  master.on('foundServer', (server) => {
    // logger.log(`Found server [${server.ip}:${server.port}]`);
  });
  master.on('serverAdd', (server, changes) => {
    Action.add('SERVER_ADD', changes);
    purgeWhenIdle();
  });
  master.on('serverUpdate', (server, changes) => {
    Action.add('SERVER_UPDATE', changes);
    purgeWhenIdle();
  });
  master.on('serverDelete', (server, changes) => {
    Action.add('SERVER_DELETE', changes);
    purgeWhenIdle();
  });
  master.on('playerAdd', (server, player, changes) => {
    Action.add('PLAYER_ADD', changes);
    purgeWhenIdle();
  });
  master.on('playerUpdate', (server, player, changes) => {
    Action.add('PLAYER_UPDATE', changes);
    purgeWhenIdle();
  });
  master.on('playerDelete', (server, player, changes) => {
    Action.add('PLAYER_DELETE', changes);
    purgeWhenIdle();
  });
}

function liveforkGetInit() {
  return {
    servers: WfServer.getAllActive(),
    players: WfPlayer.getAllActive(),
  }
}

function liveforkGetUpdate(client) {
  let actions;
  [actions, client.lastAction] = Action.getFrom(client.lastAction);

  Action.purgeActionLog(
    [...clients].map( (client) => {
      return client.lastAction;
    })
  );

  return actions;
}

function purgeWhenIdle() {
  if (clients.size == 0) {
    Action.purgeActionLog([]);
  }
}

// maybe this should be called when site is done loading
// but i'm not sure where that is.
// initializeLivefork();
