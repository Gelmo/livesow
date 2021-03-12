/**
 * Copyright (c) 2018 DenMSC
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import EventEmitter from 'events';
import { createLogger } from '../lib/logger.mjs';
import { udpRequest, resolveDnsMultiple } from '../lib/udputils.mjs';

import { WfServer } from './wfserver.mjs';
import { multiUdpRequest } from '../lib/udputils.mjs';

const logger = createLogger('WfMaster');

const IGNORE_UDP6 = true;
const MASTER_INTERVAL = 60000;

const OOB_PADDING = '\xFF\xFF\xFF\xFF';
const EOT = 'EOT\x00\x00\x00';

const REQUEST_HEADER = {
  'udp4': OOB_PADDING + 'getservers',
  'udp6': OOB_PADDING + 'getserversExt',
};
const RESPONSE_HEADER = {
  'udp4': OOB_PADDING + 'getserversResponse',
  'udp6': OOB_PADDING + 'getserversExtResponse',
};
const TYPE_TOKEN = {
  'udp4': '\\',
  'udp6': '/',
};

export class WfMaster extends EventEmitter {
  constructor() {
    super();

    this.masterServers = [
      { host: 'master1.forbidden.gg', port: 27950 },
      { host: 'master1.icy.gg', port: 27950 },
      // { host: 'dpmaster.deathmask.net', port: 27950 },
    ];

    this.protocols = [
      '22',
    ];

    this.changes = new Set();

    this.dnsResolveServers();
  }

  async dnsResolveServers() {
    this.masterServers = await resolveDnsMultiple(this.masterServers);
    this.sendRequests();
  }

  sendRequests() {
    this.masterServers.forEach( (server) => {
      if (IGNORE_UDP6 && server.family == 'udp6') {
        return;
      }
      this.protocols.forEach( (protocol) => {
        this.sendRequest(server, protocol);
      });
    });

    setTimeout( () => {
      this.sendRequests();
    }, MASTER_INTERVAL);
  }

  async sendRequest(server, protocol) {
    multiUdpRequest(
      server.family,
      server.host,
      server.port,
      Buffer.from(REQUEST_HEADER[server.family] + ' Warfork '+protocol+' empty full', 'ascii'),
      (msg) => {
        if ( !msg ) {
          return false;
        }
    
        let index = RESPONSE_HEADER[server.family].length;
        while (index < msg.length) {
          const typeToken = msg.toString('ascii', index++, index);
    
          if ( msg.toString('ascii', index, index + EOT.length) == EOT ) {
            return false;
          }
    
          let ip = '';
          let family;
          if (typeToken === TYPE_TOKEN['udp4']) {
            family = 'udp4';
            ip = Array(4).fill().map(() => {
              const part = msg.readUInt8(index);
              index += 1;
              return part;
            }).join('.');
          }
          if (typeToken === TYPE_TOKEN['udp6']) {
            family = 'udp6';
            ip = Array(8).fill().map(() => {
              const part = msg.readUInt16BE(index).toString(16);
              index += 2;
              return part;
            }).join(':');
          }
    
          const port = msg.readUInt16BE(index);
          index += 2;
    
          this.emit('foundServer', {ip: ip, port: port});
    
          WfServer.getOrCreate(family, ip, port, (server) => {
            server.on('serverAdd', (server, changes) => {
              this.emit('serverAdd', server, changes);
            });
            server.on('serverUpdate', (server, changes) => {
              this.emit('serverUpdate', server, changes);
            });
            server.on('serverDelete', (server, changes) => {
              this.emit('serverDelete', server, changes);
            });
            server.on('playerAdd', (server, player, changes) => {
              this.emit('playerAdd', server, player, changes);
            });
            server.on('playerUpdate', (server, player, changes) => {
              this.emit('playerUpdate', server, player, changes);
            });
            server.on('playerDelete', (server, player, changes) => {
              this.emit('playerDelete', server, player, changes);
            });
          });
        }
        return true;
      }
    );
  }

  async sendRequest_old(server, protocol) {
    let msg = await udpRequest(
      server.family,
      server.host,
      server.port,
      Buffer.from(REQUEST_HEADER[server.family] + ' Warfork '+protocol+' empty full', 'ascii')
    );
    if ( !msg ) {
      return;
    }

    let index = RESPONSE_HEADER[server.family].length;
    while (index < msg.length) {
      const typeToken = msg.toString('ascii', index++, index);

      if ( msg.toString('ascii', index, index + 3) == "EOT" ) {
        break;
      }

      let ip = '';
      let family;
      if (typeToken === TYPE_TOKEN['udp4']) {
        family = 'udp4';
        ip = Array(4).fill().map(() => {
          const part = msg.readUInt8(index);
          index += 1;
          return part;
        }).join('.');
      }
      if (typeToken === TYPE_TOKEN['udp6']) {
        family = 'udp6';
        ip = Array(8).fill().map(() => {
          const part = msg.readUInt16BE(index).toString(16);
          index += 2;
          return part;
        }).join(':');
      }

      const port = msg.readUInt16BE(index);
      index += 2;

      this.emit('foundServer', {ip: ip, port: port});

      WfServer.getOrCreate(family, ip, port, (server) => {
        server.on('serverAdd', (server, changes) => {
          this.emit('serverAdd', server, changes);
        });
        server.on('serverUpdate', (server, changes) => {
          this.emit('serverUpdate', server, changes);
        });
        server.on('serverDelete', (server, changes) => {
          this.emit('serverDelete', server, changes);
        });
        server.on('playerAdd', (server, player, changes) => {
          this.emit('playerAdd', server, player, changes);
        });
        server.on('playerUpdate', (server, player, changes) => {
          this.emit('playerUpdate', server, player, changes);
        });
        server.on('playerDelete', (server, player, changes) => {
          this.emit('playerDelete', server, player, changes);
        });
      });
    }
  }
}
