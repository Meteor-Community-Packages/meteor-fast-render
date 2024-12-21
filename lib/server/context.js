import { Meteor } from 'meteor/meteor';
import { Log } from 'meteor/logging';
import { Accounts } from 'meteor/accounts-base';
import { DDP } from 'meteor/ddp';
import { Random } from 'meteor/random';
import PublishContext from './publish_context';
import { EJSON } from 'meteor/ejson';

export class Context {
  constructor (loginToken, otherParams) {
    this._collectionData = {};
    this._subscriptions = {};
    this._extraData = {};
    this._loginToken = loginToken;

    Object.assign(this, otherParams);
  }

  async init () {
    // get the user
    if (Meteor.users) {
      let user;
      // check to make sure, we've the loginToken,
      // otherwise a random user will fetched from the db
      if (this._loginToken) {
        const hashedToken = Accounts._hashLoginToken(this._loginToken);
        const query = { 'services.resume.loginTokens.hashedToken': hashedToken };
        const options = { fields: { _id: 1 } };
        user = await Meteor.users.findOneAsync(query, options);
      }

      // support for Meteor.user
      // eslint-disable-next-line
      const _meteor_dynamics = Meteor._getValueFromAslStore('_meteor_dynamics') || [];
      _meteor_dynamics[DDP._CurrentInvocation.slot] = this;

      if (user) {
        this.userId = user._id;
      }
    }
    return this;
  }

  async subscribe (subName /*, params */) {
    const publishHandler = Meteor.server.publish_handlers[subName];
    if (publishHandler) {
      const params = Array.prototype.slice.call(arguments, 1);
      // non-universal subs have subscription id
      const subscriptionId = Random.id();
      const publishContext = new PublishContext(
        this,
        publishHandler,
        subscriptionId,
        params,
        subName,
      );

      return await this.processPublication(publishContext);
    } else {
      Log.warn('There is no such publish handler named:', subName);
      return {};
    }
  }

  async processPublication (publishContext) {
    const data = {};
    const ensureCollection = (collectionName) => {
      this._ensureCollection(collectionName);
      if (!data[collectionName]) {
        data[collectionName] = [];
      }
    };

    try {
      await new Promise((resolve, reject) => {
        let resolved = false;
        publishContext.onStop(() => {
          if (!resolved) {
            resolved = true;
            resolve();
          }
        });

        publishContext._runHandler()
          .then(() => {
            if (!publishContext._subscriptionId) {
              publishContext.stop();
            }
            if (!resolved) {
              Meteor.setTimeout(() => {
                if (!resolved) {
                  resolved = true;
                  const message =
                    'Publish handler for ' +
                    publishContext._name +
                    ' sent no ready signal\n' +
                    ' This could be because this publication `return null`.\n' +
                    ' Use `return this.ready()` instead.';
                  Log.warn(message);
                  resolve();
                }
              }, 500);
            }
          })
          .catch(reject);
      });
    } catch (error) {
      console.error('Error in processPublication:', error);
      throw error;
    }

    publishContext.stop();

    for (let [collectionName, collData] of Object.entries(publishContext._collectionData)) {
      collData = Object.values(collData);
      ensureCollection(collectionName);
      data[collectionName].push(collData);
      this._collectionData[collectionName].push(collData);
    }

    return data;
  }

  completeSubscriptions (name, params) {
    let subs = this._subscriptions[name];
    if (!subs) {
      subs = this._subscriptions[name] = {};
    }

    if (params && params.length) {
      const lastParam = params[params.length - 1];
      if (
        lastParam &&
        (Object.prototype.hasOwnProperty.call(lastParam, 'onStop') ||
          Object.prototype.hasOwnProperty.call(lastParam, 'onReady'))
      ) {
        params.pop();
      }
    }

    subs[EJSON.stringify(params)] = true;
  }

  _ensureCollection (collectionName) {
    if (!this._collectionData[collectionName]) {
      this._collectionData[collectionName] = [];
    }
  }

  getData () {
    return {
      collectionData: this._collectionData,
      subscriptions: this._subscriptions,
      loginToken: this._loginToken,
    };
  }

  addExtraData (key, data) {
    this._extraData[key] = data;
  }

  getExtraData () {
    return this._extraData;
  }
}
