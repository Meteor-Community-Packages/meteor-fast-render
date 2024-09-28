/* eslint-env mocha */
import { FastRender } from 'meteor/communitypackages:fast-render';
import { Random } from 'meteor/random';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Accounts } from 'meteor/accounts-base';
import { assert } from 'chai';

describe('context', function () {
  it('subscribe', async function () {
    const collName = Random.id();
    const coll = new Mongo.Collection(collName);
    await coll.insertAsync({ _id: 'one', age: 20 });
    await coll.insertAsync({ _id: 'two', age: 40 });

    const pubName = Random.id();
    Meteor.publish(pubName, function () {
      return coll.find();
    });

    const context = await new FastRender._Context().init();
    await context.subscribe(pubName);

    const expectedData = {
      subscriptions: {},
      collectionData: {},
      loginToken: undefined,
    };
    expectedData.subscriptions[pubName] = { '[]': true };
    expectedData.collectionData[collName] = [await coll.find().fetchAsync()];

    assert.deepEqual(context.getData(), expectedData);
  });

  it('subscribe with this.x apis', async function () {
    const collName = Random.id();
    const coll = new Mongo.Collection(collName);
    await coll.insertAsync({ _id: 'one', age: 20 });
    await coll.insertAsync({ _id: 'two', age: 40 });

    const pubName = Random.id();
    Meteor.publish(pubName, async function () {
      const data = await coll.find().fetchAsync();
      this.added(collName, data[0]._id, data[0]);
      this.added(collName, data[1]._id, data[1]);
      this.ready();
    });

    const context = await new FastRender._Context().init();
    await context.subscribe(pubName);

    const expectedData = {
      subscriptions: {},
      collectionData: {},
      loginToken: undefined,
    };
    expectedData.subscriptions[pubName] = { '[]': true };
    expectedData.collectionData[collName] = [await coll.find().fetchAsync()];

    assert.deepEqual(context.getData(), expectedData);
  });

  it('subscribe with this.x apis - no ready called', async function () {
    const pubName = Random.id();
    Meteor.publish(pubName, function () { });

    const context = new FastRender._Context();
    await context.subscribe(pubName);

    const expectedData = {
      subscriptions: {},
      collectionData: {},
      loginToken: undefined,
    };

    assert.deepEqual(context.getData(), expectedData);
  });

  it('logged in user', async function (done) {
    const id = Random.id();
    const username = Random.id();
    const loginToken = Random.id();

    await Meteor.users.insertAsync({ _id: id, username: username });
    const hashedToken = Accounts._hashLoginToken(loginToken);
    await Meteor.users.updateAsync(id, {
      $set: { 'services.resume.loginTokens.hashedToken': hashedToken },
    });

    const pubName = Random.id();
    Meteor.publish(pubName, function () {
      assert.equal(this.userId, id);
      assert.equal(Meteor.userId(), id);
      done();
    });

    const context = await new FastRender._Context(loginToken).init();
    await context.subscribe(pubName);
  });
});
