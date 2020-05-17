/**
 * Copyright (c) 2018 DenMSC
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import http from 'http';
import { createLogger } from './logger.mjs';
const logger = createLogger('geolocate');

const continents = {
  'EU': ['AD','AL','AT','AX','BA','BE','BG','BY','CH','CY','CZ','DE','DK','EE','ES','FI','FO','FR','GB','GG','GI','GR','HR','HU','IE','IM','IS','IT','JE','LI','LT','LU','LV','MC','MD','ME','MK','MT','NL','NO','PL','PT','RO','RS','RU','SE','SI','SJ','SK','SM','UA','VA','XK'],
  'AS': ['AE','AF','AM','AZ','BD','BH','BN','BT','CC','CN','CX','GE','HK','ID','IL','IN','IO','IQ','IR','JO','JP','KG','KH','KP','KR','KW','KZ','LA','LB','LK','MM','MN','MO','MV','MY','NP','OM','PH','PK','PS','QA','SA','SG','SY','TH','TJ','TM','TR','TW','UZ','VN','YE'],
  'NA': ['AG','AI','AW','BB','BL','BM','BQ','BS','BZ','CA','CR','CU','CW','DM','DO','GD','GL','GP','GT','HN','HT','JM','KN','KY','LC','MF','MQ','MS','MX','NI','PA','PM','PR','SV','SX','TC','TT','US','VC','VG','VI'],
  'AF': ['AO','BF','BI','BJ','BW','CD','CF','CG','CI','CM','CV','DJ','DZ','EG','EH','ER','ET','GA','GH','GM','GN','GQ','GW','KE','KM','LR','LS','LY','MA','MG','ML','MR','MU','MW','MZ','NA','NE','NG','RE','RW','SC','SD','SH','SL','SN','SO','SS','ST','SZ','TD','TG','TN','TZ','UG','YT','ZA','ZM','ZW' ],
  'AN': ['AQ','BV','GS','HM','TF'],
  'SA': ['AR','BO','BR','CL','CO','EC','FK','GF','GY','PE','PY','SR','UY','VE'],
  'OC': ['AS','AU','CK','FJ','FM','GU','KI','MH','MP','NC','NF','NR','NU','NZ','PF','PG','PN','PW','SB','TK','TL','TO','TV','UM','VU','WF','WS'],
}

function countryToContinent(countryCode) {
  for (let continent in continents) {
    if (continents[continent].indexOf(countryCode) > -1) {
      return continent;
    }
  }
}

export function geoLocateRegion(ip, onFound) {
  http.get('http://ip-api.com/json/'+ip, (resp) => {
    let data = '';
    resp.on('data', (chunk) => {
      data += chunk;
    });
    resp.on('end', () => {
      // logger.log(`geolocate api received: ${data}`);
      try {
        const respJson = JSON.parse(data);
        if (respJson.status == 'success') {
          const countryCode = respJson.countryCode;
          onFound(countryCode, countryToContinent(countryCode));
        } else {
          // logger.log(`geolocate api error: ${respJson.message}`);
          onFound();
        }
      } catch (error) {
        // logger.log(`geolocate error: ${error.message}`);
        onFound();
      }
    });
  }).on('error', (err) => {
    // logger.log(`geolocate error: ${err.message}`);
    onFound();
  });
}