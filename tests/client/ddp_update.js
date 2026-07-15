/* eslint-env mocha */
import { FastRender } from 'meteor/communitypackages:fast-render';
import { Random } from 'meteor/random';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { EJSON } from 'meteor/ejson';
import { assert } from 'chai';

const bufferedWritesInterval = 10;

describe('DDPUpdate', function () {
  it('convert added to changed', function (done) {
    const collName = Random.id();
    const coll = new Mongo.Collection(collName);

    Meteor.connection._livedata_data({
      msg: 'added',
      collection: collName,
      id: 'one',
      fields: { name: 'arunoda' },
    });

    Meteor.setTimeout(async function () {
      const doc = await coll.findOneAsync('one');
      console.log(doc);
      assert.deepEqual(doc, { _id: 'one', name: 'arunoda' });

      Meteor.connection._livedata_data({
        msg: 'added',
        collection: collName,
        id: 'one',
        fields: { name: 'kuma', age: 20 },
      });

      Meteor.setTimeout(async function () {
        assert.deepEqual(await coll.findOneAsync('one'), { _id: 'one', name: 'kuma', age: 20 });
        done();
      }, bufferedWritesInterval);
    }, bufferedWritesInterval);
  });

  it('create collection later on', function (done) {
    const collName = Random.id();

    Meteor.connection._livedata_data({
      msg: 'added',
      collection: collName,
      id: 'one',
      fields: { name: 'arunoda' },
    });

    Meteor.connection._livedata_data({
      msg: 'added',
      collection: collName,
      id: 'two',
      fields: { name: 'kamal' },
    });

    const coll = new Mongo.Collection(collName);
    Meteor.setTimeout(async function () {
      const docs = await coll.find().fetchAsync()
      console.log(docs);
      assert.equal(docs.length, 2);
      done();
    }, bufferedWritesInterval);
  });

  it('delete subscriptions', function () {
    FastRender._revertedBackToOriginal = false;
    const sub1 = { name: 'coola', paramsKey: 'k1' };
    const sub2 = { name: 'booma', paramsKey: 'k2' };
    FastRender._subscriptionIdMap = { subId: sub1, subId2: sub2 };
    FastRender._subscriptions = { coola: { k1: true }, booma: { k2: true } };

    Meteor.connection._livedata_data({
      msg: 'ready',
      subs: ['subId'],
    });

    FastRender._revertedBackToOriginal = true;

    assert.deepEqual(FastRender._subscriptionIdMap, { subId2: sub2 });
    assert.deepEqual(FastRender._subscriptions, { booma: { k2: true } });
  });

  it('ignore frGen ready messages', function () {
    FastRender._revertedBackToOriginal = false;
    FastRender._subscriptionIdMap = { subId: 'coola', subId2: 'coola' };
    FastRender._subscriptions = { coola: true, booma: true };

    Meteor.connection._livedata_data({
      msg: 'ready',
      subs: ['subId'],
      frGen: true,
    });

    FastRender._revertedBackToOriginal = true;

    assert.deepEqual(FastRender._subscriptionIdMap, { subId: 'coola', subId2: 'coola' });
    assert.deepEqual(FastRender._subscriptions, { coola: true, booma: true });
  });

  it('revertedBackToOriginal', function () {
    FastRender._revertedBackToOriginal = false;
    FastRender._subscriptionIdMap = { subId: { name: 'coola', paramsKey: 'pk' } };
    FastRender._subscriptions = { coola: { pk: true } };

    Meteor.connection._livedata_data({
      msg: 'ready',
      subs: ['subId'],
    });

    assert.deepEqual(FastRender._subscriptionIdMap, {});
    assert.deepEqual(FastRender._subscriptions, {});
    assert.equal(FastRender._revertedBackToOriginal, true);
  });

  it('fake ready messages', function () {
    FastRender._revertedBackToOriginal = false;
    const orginalSend = Meteor.connection._send;

    const params = [10, 20];
    const paramsKey = EJSON.stringify(params);
    FastRender._subscriptions = { coolio: {} };
    FastRender._subscriptions.coolio[paramsKey] = true;

    const subId = 'the-id';
    Meteor.connection._send({
      msg: 'sub',
      name: 'coolio',
      id: subId,
      params: params,
    });
    assert.deepEqual(FastRender._subscriptionIdMap, {
      'the-id': { name: 'coolio', paramsKey: paramsKey },
    });

    Meteor.connection._send = orginalSend;
    FastRender._revertedBackToOriginal = false;
  });
});
