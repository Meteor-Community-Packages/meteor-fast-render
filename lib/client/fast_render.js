/* global location */
import { Meteor } from 'meteor/meteor';
import { Accounts } from 'meteor/accounts-base';
import { InjectData } from 'meteor/communitypackages:inject-data';
import { onPageLoad } from 'meteor/server-render';
import { IDTools } from './id_tools';

import './auth';
import './boot';
import './ddp_update';

let extraneousData = {};

export const FastRender = {
  _dataReceived: false,
  _revertedBackToOriginal: false,
  IDTools,
  _blockDDP: Meteor._localStorage.getItem('__frblockddp') !== null,
  _disable: Meteor._localStorage.getItem('__frdisable') !== null,
  debugger: {
    _logs: [],

    log (message /*, args.. */) {
      if (
        typeof console !== 'undefined' &&
        typeof Meteor._localStorage !== 'undefined' &&
        Meteor._localStorage.getItem('__frlog') === '1'
      ) {
        FastRender.debugger._logs.push(arguments);
        arguments[0] = 'FR: ' + arguments[0];
        console.log.apply(console, arguments);
      }
    },

    showLogs () {
      Meteor._localStorage.setItem('__frlog', '1');
      location.reload();
    },

    hideLogs () {
      Meteor._localStorage.removeItem('__frlog');
      location.reload();
    },

    getLogs () {
      return FastRender.debugger._logs;
    },

    getLogsJSON () {
      return JSON.stringify(FastRender.debugger._logs);
    },

    blockDDP () {
      Meteor._localStorage.setItem('__frblockddp', '1');
      location.reload();
    },

    unblockDDP () {
      Meteor._localStorage.removeItem('__frblockddp');
      location.reload();
    },

    disableFR () {
      Meteor._localStorage.setItem('__frdisable', '1');
      location.reload();
    },

    enableFR () {
      Meteor._localStorage.removeItem('__frdisable');
      location.reload();
    },

    getPayload () {
      return FastRender._payload;
    },

    getPayloadJSON () {
      return JSON.stringify(FastRender._payload);
    },
  },

  wait () {
    FastRender._wait = true;
  },

  onDataReady (callback) {
    FastRender.wait();

    InjectData.getData('fast-render-data', function (data) {
      FastRender.init(data);
      InjectData.getData('fast-render-extra-data', function (payload) {
        FastRender._setExtraData(payload);
        callback();
      });
    });
  },

  // This allow us to apply DDP message even if Meteor block accepting messages
  //  When doing initial login, Meteor sends an login message
  //  Then it'll block the accpeting DDP messages from server
  //  This is the cure
  injectDdpMessage (conn, message) {
    FastRender.debugger.log('injecting ddp message:', message);

    // Removed check for conn._bufferedWrites due to https://github.com/kadirahq/fast-render/pull/167/files#r74189260
    // and https://github.com/kadirahq/fast-render/issues/176

    const originalWait = conn._waitingForQuiescence;
    conn._waitingForQuiescence = function () {
      return false;
    };
    conn._livedata_data(message);
    conn._waitingForQuiescence = originalWait;
  },

  _setExtraData (data) {
    extraneousData = data;
  },

  addExtraData () {
    // we provide this method for symmetry to avoid having to use isClient/isServer checks
  },

  getExtraData (key) {
    const data = extraneousData[key];
    if (data) {
      delete extraneousData[key];
      return data;
    } else {
      return null;
    }
  },

  init (payload) {
    console.log('init called');
    if (FastRender._disable) return;

    FastRender._securityCheck(payload);
    FastRender._subscriptions = (payload && payload.subscriptions) || {};
    FastRender._subscriptionIdMap = {};
    FastRender._dataReceived = true;
    FastRender._payload = payload;

    // merging data from different subscriptions
    //  yes, this is a minimal mergeBox on the client
    const allData = {};
    if (payload) {
      Object.keys(payload.collectionData).forEach(function (collName) {
        console.log(collName);
        const subData = payload.collectionData[collName];
        if (!allData[collName]) {
          allData[collName] = {};
        }
        const collData = allData[collName];

        subData.forEach(function (dataSet) {
          dataSet.forEach(function (item) {
            console.log(item._id);
            if (!collData[item._id]) {
              collData[item._id] = item;
            } else {
              FastRender._DeepExtend(collData[item._id], item);
            }
          });
        });
        console.log(collData);
      });
    }

    const connection = Meteor.connection;

    Object.keys(allData).forEach(function (collName) {
      const collData = allData[collName];
      Object.keys(collData).forEach(function (id) {
        const item = collData[id];
        id = IDTools.idStringify(item._id);
        delete item._id;

        const ddpMessage = {
          msg: 'added',
          collection: collName,
          id: id,
          fields: item,
          frGen: true,
        };

        FastRender.injectDdpMessage(connection, ddpMessage);
        try {
          // If the connection supports buffered DDP writes, then flush now.
          if (connection._flushBufferedWrites) connection._flushBufferedWrites();
        } catch (e) {
          console.error(
            'FastRender was unable to simulate the following DDP message: ',
            ddpMessage,
            e,
          );
        }
      });
    });

    // let Meteor know, user login process has been completed
    if (typeof Accounts !== 'undefined') {
      Accounts._setLoggingIn(false);
    }
  },

  _securityCheck (payload) {
    if (payload && payload.loginToken) {
      const localStorageLoginToken = Meteor._localStorage.getItem(
        'Meteor.loginToken',
      );
      if (localStorageLoginToken !== payload.loginToken) {
        throw new Error(
          'seems like cookie tossing is happening. visit here: http://git.io/q4IRHQ',
        );
      }
    }
  },

  _AddedToChanged (localCopy, added) {
    added.msg = 'changed';
    added.cleared = [];
    added.fields = added.fields || {};

    Object.keys(localCopy).forEach(function (key) {
      if (key !== '_id') {
        if (typeof added.fields[key] === 'undefined') {
          added.cleared.push(key);
        }
      }
    });
  },

  _ApplyDDP (existing, message) {
    let newDoc = !existing ? {} : Object.assign({}, existing);
    if (message.msg === 'added') {
      Object.keys(message.fields).forEach(function (key) {
        newDoc[key] = message.fields[key];
      });
    } else if (message.msg === 'changed') {
      Object.keys(message.fields).forEach(function (key) {
        newDoc[key] = message.fields[key];
      });
      message.cleared.forEach(function (key) {
        delete newDoc[key];
      });
    } else if (message.msg === 'removed') {
      newDoc = null;
    }

    return newDoc;
  },

  // source: https://gist.github.com/kurtmilam/1868955
  //  modified a bit to not to expose this as an _ api
  _DeepExtend (obj) {
    const parentRE = /#{\s*?_\s*?}/;
    const slice = Array.prototype.slice;
    const hasOwnProperty = Object.prototype.hasOwnProperty;
    slice.call(arguments, 1).forEach(function (source) {
      for (const prop in source) {
        if (hasOwnProperty.call(source, prop)) {
          if (
            obj[prop] === null ||
            obj[prop] === undefined ||
            typeof obj[prop] === 'function' ||
            source[prop] === null ||
            source[prop] instanceof Date
          ) {
            obj[prop] = source[prop];
          } else if (typeof source[prop] === 'string' && parentRE.test(source[prop])) {
            if (typeof obj[prop] === 'string') {
              obj[prop] = source[prop].replace(parentRE, obj[prop]);
            }
          } else if (obj[prop] instanceof Array || source[prop] instanceof Array) {
            if (!(obj[prop] instanceof Array) || !(source[prop] instanceof Array)) {
              throw new Meteor.Error('Error: Trying to combine an array with a non-array (' +
                prop +
                ')');
            } else {
              obj[prop] = FastRender._DeepExtend(obj[prop], source[prop]).filter(
                function (item) {
                  return item !== null;
                },
              );
            }
          } else if (typeof obj[prop] === 'object' || typeof source[prop] === 'object') {
            if (typeof obj[prop] !== 'object' || typeof source[prop] !== 'object') {
              throw new Meteor.Error('Error: Trying to combine an object with a non-object (' +
                prop +
                ')');
            } else {
              obj[prop] = FastRender._DeepExtend(obj[prop], source[prop]);
            }
          } else {
            obj[prop] = source[prop];
          }
        }
      }
    });
    return obj;
  },

  onPageLoad (callback) {
    FastRender.wait();
    console.log(FastRender._wait);
    onPageLoad(sink => {
      InjectData.getData('fast-render-data', function (data) {
        FastRender.init(data);
        InjectData.getData('fast-render-extra-data', function (payload) {
          FastRender._setExtraData(payload);
          callback(sink);
        });
      });
    });
  },
};

if (FastRender._blockDDP) {
  console.log(
    "FastRender is blocking DDP messages. apply 'FastRender.debugger.unblockDDP()' to unblock again.",
  );
}

if (FastRender._disable) {
  console.log(
    "FastRender is disabled. apply 'FastRender.debugger.enableFR()' to enable it back.",
  );
}
