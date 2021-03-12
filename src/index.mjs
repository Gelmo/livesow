/**
 * Copyright (c) 2018 DenMSC
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import WebSocket from 'ws';
import { initializeLivefork, acceptConnection } from './livefork.mjs';

const wss = new WebSocket.Server({
  port: 1337,
});

wss.on('connection', acceptConnection);

initializeLivefork();