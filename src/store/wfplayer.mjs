/**
 * Copyright (c) 2018 DenMSC
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import { createUuid } from '../lib/uuid.mjs';
import { createLogger } from '../lib/logger.mjs';
const logger = createLogger('WfPlayer');

const players = new Set();

export class WfPlayer {
    constructor(server, name, score, team, ping) {
      this.id = createUuid();
      this.server = server;
      this.name = name;
      this.score = score;
      this.team = team;
      this.ping = ping;
    }

    toString() {
      return `[${this.name}: ${this.score} ${this.team} ${this.ping}]`;
    }

    static getOrCreateOrUpdate(server, name, score, team, ping, onCreated, onUpdate) {
      let player = WfPlayer.getByServerName(server, name);
      if (!player) {
        player = new WfPlayer(server, name, score, team, ping);
        players.add(player);
        onCreated(player, {
          id: player.id,
          server: server.id,
          name: name,
          score: score,
          team: team,
          ping: ping,
        });
      } else {
        let changes = {id: player.id};
        let changed = false;
        if (score != player.score) {
          changed = true;
          changes.score = score;
          player.score = score;
        }
        if (team != player.team) {
          changed = true;
          changes.team = team;
          player.team = team;
        }
        if (ping != player.ping) {
          changed = true;
          changes.ping = ping;
          player.ping = ping;
        }
        if (changed) {
          onUpdate(player, changes);
        }
      }

      return player;
    }

    static delete(player) {
      players.delete(player);
    }

    static getByServerName(server, name) {
      return [...players].find( (player) => {
        return player.server == server &&
          player.name == name;
      })
    }

    static pruneGhostsForServer(server, onPruned) {
      players.forEach( (player, val2, set) => {
        if (player.server == server) {
          if (!server.getPlayerByName(player.name)) {
            const changes = {id: player.id};
            onPruned(player, changes);
            WfPlayer.delete(player);
          }
        }
      });
    }

    static logAll() {
      logger.log(`${players.size} player(s):`);
      players.forEach( (player) => {
        logger.log(`${player}`);
      });
    }

    static getAllActive() {
      return [...players].map( (player) => {
        return {
          id: player.id,
          server: player.server.id,
          name: player.name,
          score: player.score,
          team: player.team,
          ping: player.ping,
        };
      });
    }
  }
