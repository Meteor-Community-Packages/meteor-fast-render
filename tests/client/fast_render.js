/* eslint-env mocha */
import { FastRender } from 'meteor/communitypackages:fast-render';
import { Random } from 'meteor/random';
import { Meteor } from 'meteor/meteor';
import { Mongo } from 'meteor/mongo';
import { assert } from 'chai';

const bufferedWritesInterval = 5;

describe('FastRender', function () {
  describe('init()', function () {
    it('coll data', function () {
      const expectedMessages = [
        {
          msg: 'added',
          collection: 'posts',
          id: 'one',
          fields: { name: 'arunoda' },
          frGen: true,
        },
        {
          msg: 'added',
          collection: 'posts',
          id: 'two',
          fields: { name: 'meteorhacks' },
          frGen: true,
        },
        {
          msg: 'added',
          collection: 'comments',
          id: 'one',
          fields: { text: 'great' },
          frGen: true,
        },
      ];

      const payload = {
        subscriptions: { posts: true },
        collectionData: {
          posts: [
            [{ _id: 'one', name: 'arunoda' }, { _id: 'two', name: 'meteorhacks' }],
          ],
          comments: [[{ _id: 'one', text: 'great' }]],
        },
      };

      const newMessages = [];

      WithNewInjectDdpMessage(
        function (conn, ddpMessage) {
          newMessages.push(ddpMessage);
        },
        function () {
          FastRender.init(payload);

          assert.deepEqual(newMessages, expectedMessages);
          assert.deepEqual(FastRender._subscriptions, payload.subscriptions);
        },
      );
    });

    it('ObjectId support', function (done) {
      const id = new FastRender.IDTools.ObjectID();
      const payload = {
        subscriptions: { posts: true },
        collectionData: {
          posts: [[{ _id: id, name: 'arunoda' }]],
        },
      };

      WithNewInjectDdpMessage(
        function (conn, ddpMessage) {
          assert.equal(ddpMessage.id, id._str);
          done();
        },
        function () {
          FastRender.init(payload);
        },
      );
    });

    it('merge docs deep', function (done) {
      const collName = Random.id();
      const payload = {
        subscriptions: { posts: true },
        collectionData: {},
      };

      payload.collectionData[collName] = [
        [{ _id: 'one', name: 'arunoda', profile: { name: 'arunoda' } }],
        [
          {
            _id: 'one',
            name: 'arunoda',
            profile: { email: 'arunoda@arunoda.com' },
          },
        ],
      ];

      FastRender.init(payload);

      const coll = new Mongo.Collection(collName);
      Meteor.setTimeout(function () {
        assert.deepEqual(coll.findOne('one'), {
          _id: 'one',
          name: 'arunoda',
          profile: {
            name: 'arunoda',
            email: 'arunoda@arunoda.com',
          },
        });
        done();
      }, bufferedWritesInterval);
    });

    it('ejson data', function (done) {
      const collName = Random.id();
      const payload = {
        subscriptions: { posts: true },
        collectionData: {},
      };

      const date = new Date('2014-10-20');
      payload.collectionData[collName] = [
        [{ _id: 'one', name: 'arunoda', date: date }],
      ];

      FastRender.init(payload);

      const coll = new Mongo.Collection(collName);
      Meteor.setTimeout(function () {
        const doc = coll.findOne('one');
        assert.equal(doc.date.getTime(), date.getTime());
        done();
      }, bufferedWritesInterval);
    });
  });
});

const WithNewInjectDdpMessage = function (newCallback, runCode) {
  const originalInjectDDP = FastRender.injectDdpMessage;
  FastRender.injectDdpMessage = newCallback;
  if (runCode) runCode();
  FastRender.injectDdpMessage = originalInjectDDP;
};
