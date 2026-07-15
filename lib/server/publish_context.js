import { Random } from 'meteor/random';
import { Log } from 'meteor/logging';
import { EJSON } from 'meteor/ejson';
import { Meteor } from 'meteor/meteor';
import { MeteorX } from 'meteor/montiapm:meteorx';

// mock server
const server = {
  getPublicationStrategy () {
    return {
      useCollectionView: true,
      doAccountingForCollection: true,
    };
  },
};

const PublishContext = function PublishContext (
  context,
  handler,
  subscriptionId,
  params,
  name,
) {
  // mock session
  const sessionId = Random.id();
  const session = {
    server,
    id: sessionId,
    userId: context.userId,
    // not null
    inQueue: {},
    connectionHandle: {
      id: sessionId,
      close: function () { },
      onClose: function () { },
      clientAddress: '127.0.0.1',
      httpHeaders: context.headers,
    },
    added: (subscriptionHandle, collectionName, strId, fields) => {
      // Don't share state with the data passed in by the user.
      const doc = EJSON.clone(fields);
      doc._id = this._idFilter.idParse(strId);
      Meteor._ensure(this._collectionData, collectionName)[strId] = doc;
    },
    changed: (subscriptionHandle, collectionName, strId, fields) => {
      const doc = this._collectionData[collectionName][strId];
      if (!doc) {
        throw new Error(
          'Could not find element with id ' + strId + ' to change',
        );
      }
      for (const [key, value] of Object.entries(fields)) {
        // Publish API ignores _id if present in fields.
        if (key === '_id') return;

        if (value === undefined) {
          delete doc[key];
        } else {
          // Don't share state with the data passed in by the user.
          doc[key] = EJSON.clone(value);
        }
      }
    },
    removed: (subscriptionHandle, collectionName, strId) => {
      if (
        !(
          this._collectionData[collectionName] &&
          this._collectionData[collectionName][strId]
        )
      ) {
        throw new Error('Removed nonexistent document ' + strId);
      }
      delete this._collectionData[collectionName][strId];
    },
    sendReady: (subscriptionIds) => {
      // this is called only for non-universal subscriptions
      if (!this._subscriptionId) throw new Error('Assertion.');

      // make the subscription be marked as ready
      if (!this._isDeactivated()) {
        this._context.completeSubscriptions(this._name, this._params);
      }

      // we just stop it
      this.stop();
    },
  };

  MeteorX.Subscription.call(
    this,
    session,
    handler,
    subscriptionId,
    params,
    name,
  );

  this.unblock = function () { };

  this._context = context;
  this._collectionData = {};
};

PublishContext.prototype = Object.create(MeteorX.Subscription.prototype);
PublishContext.prototype.constructor = PublishContext;

PublishContext.prototype.stop = function () {
  // our stop does not remove all documents (it just calls deactivate)
  // Meteor one removes documents for non-universal subscription
  // we deactivate both for universal and named subscriptions
  // hopefully this is right in our case
  // Meteor does it just for named subscriptions
  this._deactivate();
};

PublishContext.prototype.error = function (error) {
  // TODO: Should we pass the error to the subscription somehow?
  Log.warn(
    'error caught on publication: ',
    this._name,
    ': ',
    error.message || error,
  );
  this.stop();
};

export default PublishContext;
