/* eslint-env mocha */
import { FastRender } from 'meteor/communitypackages:fast-render';
import { Random } from 'meteor/random';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { Accounts } from 'meteor/accounts-base';
import { assert } from 'chai';

describe('context', function () {
  it('subscribe', function () {
    const collName = Random.id();
    const coll = new Mongo.Collection(collName);
    coll.insert({ _id: 'one', age: 20 });
    coll.insert({ _id: 'two', age: 40 });

    const pubName = Random.id();
    Meteor.publish(pubName, function () {
      return coll.find();
    });

    const context = new FastRender._Context();
    context.subscribe(pubName);

    const expectedData = {
      subscriptions: {},
      collectionData: {},
      loginToken: undefined,
    };
    expectedData.subscriptions[pubName] = { '[]': true };
    expectedData.collectionData[collName] = [coll.find().fetch()];

    assert.deepEqual(context.getData(), expectedData);
  });

  it('subscribe with this.x apis', function () {
    const collName = Random.id();
    const coll = new Mongo.Collection(collName);
    coll.insert({ _id: 'one', age: 20 });
    coll.insert({ _id: 'two', age: 40 });

    const pubName = Random.id();
    Meteor.publish(pubName, function () {
      const data = coll.find().fetch();
      this.added(collName, data[0]._id, data[0]);
      this.added(collName, data[1]._id, data[1]);
      this.ready();
    });

    const context = new FastRender._Context();
    context.subscribe(pubName);

    const expectedData = {
      subscriptions: {},
      collectionData: {},
      loginToken: undefined,
    };
    expectedData.subscriptions[pubName] = { '[]': true };
    expectedData.collectionData[collName] = [coll.find().fetch()];

    assert.deepEqual(context.getData(), expectedData);
  });

  it('subscribe with this.x apis - no ready called', function () {
    const pubName = Random.id();
    Meteor.publish(pubName, function () { });

    const context = new FastRender._Context();
    context.subscribe(pubName);

    const expectedData = {
      subscriptions: {},
      collectionData: {},
      loginToken: undefined,
    };

    assert.deepEqual(context.getData(), expectedData);
  });

  it('logged in user', function (done) {
    const id = Random.id();
    const username = Random.id();
    const loginToken = Random.id();

    Meteor.users.insert({ _id: id, username: username });
    const hashedToken = Accounts._hashLoginToken(loginToken);
    Meteor.users.update(id, {
      $set: { 'services.resume.loginTokens.hashedToken': hashedToken },
    });

    const pubName = Random.id();
    Meteor.publish(pubName, function () {
      assert.equal(this.userId, id);
      assert.equal(Meteor.userId(), id);
      done();
    });

    const context = new FastRender._Context(loginToken);
    context.subscribe(pubName);
  });
});
