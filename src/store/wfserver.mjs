/**
 * Copyright (c) 2018 DenMSC
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import EventEmitter from 'events';
import { createUuid } from '../lib/uuid.mjs';
import { udpRequest } from '../lib/udputils.mjs';
import { geoLocateRegion } from '../lib/geolocate.mjs';
import { WfPlayer } from './wfplayer.mjs';

const servers = new Set();
const changes = new Set();

const OOB_PADDING = '\xFF\xFF\xFF\xFF';

const REQUESTINFO = OOB_PADDING + 'getstatus';
const REQUESTHEADER = OOB_PADDING + 'statusResponse\n\\';
const STATUS_SEPARATOR = '\\';

const MATCH_SCORE_REGEX = /^(.*?): (.*?) (.*?): (.*?)$/;
const TOKENIZE_REGEX = /"(?:\\\\.|[^\\\\"])*"|\S+/g;

const INTERVAL_EMPTY =     10000;
const INTERVAL_NOPING =    5000;
const INTERVAL_POPULATED = 1000;

const ATTEMPT_MAX = 5;
const ATTEMPT_DELAY = 1000;

export class WfServer extends EventEmitter{
    constructor(family, ip, port) {
      super();

      this.id = createUuid();
      this.family = family
      this.ip = ip;
      this.port = port;
      this.players = new Set();

      this.active = false;
      this.attempts = 0;

      this.region = '';
      this.country = '';

      this.emit('serverInitialized', this);
      this.sendRequest();
    }

    async sendRequest() {
      let msg = await udpRequest(
        this.family,
        this.ip,
        this.port,
        Buffer.from(REQUESTINFO, 'ascii')
      );

      if (!msg) {
        this.attempts++;
        if ( this.attempts >= ATTEMPT_MAX ) {
          if (this.active) {
            this.players.clear();

            WfPlayer.pruneGhostsForServer(this, (player, changes) => {
              this.emit('playerDelete', this, player, changes);
            });

            this.emit('serverDelete', this, {id: this.id});
          }
          this.active = false;
          WfServer.delete(this);
        } else {
          setTimeout(() => this.sendRequest(), ATTEMPT_DELAY );
        }
        return;
      }

      this.attempts = 0;
      this.handleResponse(msg.toString('utf8', REQUESTHEADER.length));
    }

    handleResponse(msg) {
      if (!this.active && !this.region) {
        geoLocateRegion(this.ip, (country, region) => {
          this.country = country;
          this.region = region;
        })
      }
      this.active = true;

      let playerStrings = msg.split('\n');
      let infostring = playerStrings.shift();
      let infoArr = infostring.split(STATUS_SEPARATOR);

      let info = {
        id: this.id,
        family: this.family,
        ip: this.ip,
        port: this.port,
        country: this.country,
        region: this.region,
      };

      for (let i = 0; i < infoArr.length-1; i+=2) {
        info[infoArr[i]] = infoArr[i+1].trim();
      }

      info = this.processInfo(info);

      let totalPing = 0;
      playerStrings.pop();

      // search for "client bots" (0 ping) in advance, i guess
      let numClientBots = 0;
      playerStrings.forEach( (playerString) => {
        let playerArr = playerString.match(TOKENIZE_REGEX);
        const ping  = parseInt(playerArr[1]);
        if (ping == 0 ) {
          numClientBots++;
        }
      });
      info.bots = ( info.bots || 0 ) + numClientBots;
        
      const isNew = !this.info;
      if (isNew) {
        this.emit('serverAdd', this, info);
      } else {
        const changes = this.getInfoChanges(info)
        if (changes) {
          this.emit('serverUpdate', this, changes);
        }
      }
      this.info = info;

      this.players.clear();
      playerStrings.forEach( (playerString) => {
        let playerArr = playerString.match(TOKENIZE_REGEX);

        const score = parseInt(playerArr[0]);
        const ping  = parseInt(playerArr[1]);
        const name  = playerArr[2].slice(1, -1);
        const team  = parseInt(playerArr[3]);

        totalPing += ping;
        const player = WfPlayer.getOrCreateOrUpdate(this, name, score, team, ping,
          (player, changes) => {
            this.emit('playerAdd', this, player, changes);
          },
          (player, changes) => {
            this.emit('playerUpdate', this, player, changes);
          }
        );

        this.players.add(player);
      });

      WfPlayer.pruneGhostsForServer(this, (player, changes) => {
        this.emit('playerDelete', this, player, changes);
      });

      let interval = 0;
      if ( this.players.size > 0 && totalPing > 0 ) {
        interval = INTERVAL_POPULATED;
      } else if ( this.players.size > 0 ) {
        interval = INTERVAL_NOPING;
      } else {
        interval = INTERVAL_EMPTY;
      }

      if ( this.info.hasOwnProperty('sv_livefork_interval') && !isNaN(this.info.sv_livefork_interval) ) {
        interval = Math.max(interval, this.info.sv_livefork_interval);
      }

      setTimeout( () => {
        this.sendRequest();
      }, interval);
    }

    parseInfoInt(info, prop) {
      if (info.hasOwnProperty(prop)) {
        info[prop] = parseInt(info[prop]);
      }
    }

    processInfo(info) {
      this.parseInfoInt(info, 'g_antilag');
      this.parseInfoInt(info, 'g_instagib');
      this.parseInfoInt(info, 'g_needpass');
      this.parseInfoInt(info, 'g_race_gametype');
      this.parseInfoInt(info, 'protocol');
      this.parseInfoInt(info, 'sv_cheats');
      this.parseInfoInt(info, 'sv_http');
      this.parseInfoInt(info, 'sv_maxclients');
      this.parseInfoInt(info, 'sv_maxmvclients');
      this.parseInfoInt(info, 'sv_mm_enable');
      this.parseInfoInt(info, 'sv_mm_loginonly');
      this.parseInfoInt(info, 'sv_pps');
      this.parseInfoInt(info, 'sv_pure');
      this.parseInfoInt(info, 'sv_skilllevel');
      this.parseInfoInt(info, 'sv_skillRating');
      this.parseInfoInt(info, 'bots');
      this.parseInfoInt(info, 'clients');
      this.parseInfoInt(info, 'tv');
      this.parseInfoInt(info, 'sv_livefork_interval');

      if (!info.hasOwnProperty('g_race_gametype')) {
        info.race = ~~(info.hasOwnProperty('gametype') && info.gametype.includes('race'));
      } else {
        info.race = ~~(info.g_race_gametype == 1);
      }

      if (info.hasOwnProperty('g_match_score') && info.g_match_score) {
        const tempScore = info.g_match_score.match(MATCH_SCORE_REGEX);
        info.team_alpha_name =  tempScore[1];
        info.team_alpha_score = tempScore[2];
        info.team_beta_name =   tempScore[3];
        info.team_beta_score =  tempScore[4];
      }

      return info;
    }

    getInfoChanges(info) {
      const changes = {};
      let hasChanges = false;
      Object.entries(info).forEach( ([key, value]) => {
        if (this.info.hasOwnProperty(key) && this.info[key] != info[key]) {
          changes[key] = value;
          hasChanges = true;
        }
      });
      if (!hasChanges) {
        return false;
      }
      changes.id = this.id;
      return changes;
    }

    toString() {
      return `[${this.id.substr(0, 7)} => (${this.family}) ${this.ip}:${this.port}]`;
    }

    addPlayer(name) {
      const player = WfPlayer.create(this, name);
      return player;
    }

    getPlayerByName(name) {
      return [...this.players].find( (player) => {
        return player.name == name;
      });
    }

    static getOrCreate(family, ip, port, onCreated) {
      let server = WfServer.getByIp(family, ip, port);
      if (!server) {
        server = new WfServer(family, ip, port);
        servers.add(server);
        onCreated(server);
      }

      return server;
    }

    static delete(server) {
      servers.delete(server);
    }

    static getById(id) {
      return [...servers].forEach( (server) => {
        return server.id == id;
      });
    }

    static getByIp(family, ip, port) {
      return [...servers].find( (server) => {
        return server.family == family &&
          server.ip == ip &&
          server.port == port;
      });
    }

    static getAllActive() {
      return [...servers].filter( (server) => {
        return server.active;
      }).map( (server) => {
        return server.info;
      });
    }
  }
