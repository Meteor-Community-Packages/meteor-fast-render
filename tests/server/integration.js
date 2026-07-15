/* eslint-env mocha */
import { FastRender } from 'meteor/communitypackages:fast-render';
import { InjectData } from 'meteor/communitypackages:inject-data';
import { Random } from 'meteor/random';
import { Meteor } from 'meteor/meteor';
import { fetch } from 'meteor/fetch';
import { check } from 'meteor/check';
import { should, assert } from 'chai';
import { URL } from 'url';

should();
describe('integration', function () {
  it('a simple route', async function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    await coll.insertAsync(obj);

    Meteor.publish(pubName, async function () {
      return coll.findAsync();
    });

    FastRender.route(path, async function () {
      await this.subscribe(pubName);
    });
    obj._id.should.equal('one');

    const data = await getFRData(path);
    // data.subscriptions.should.have.property(pubName);
    // data.collectionData[collName][0][0].should.deep.equal(obj);
    // assert.isDefined(data.subscriptions[pubName]);
    // assert.deepEqual(data.collectionData[collName][0][0], obj);
  });

  it('onAllRoutes', async function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    await coll.insertAsync(obj);

    const cursorHandler = createCursorHandler(function () {
      return coll.find();
    });

    Meteor.publish(pubName, async function () {
      return await cursorHandler.get();
    });
    FastRender.route(path, function () { });
    FastRender.onAllRoutes(async function () {
      await this.subscribe(pubName);
    });

    const data = await getFRData(path);
    assert.isDefined(data.subscriptions[pubName]);
    assert.deepEqual(data.collectionData[collName][0][0], obj);
    cursorHandler.stop();
  });

  it('onAllRoutes + route', async function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj1 = { _id: 'one', aa: 10 };
    const obj2 = { _id: 'two', aa: 10 };

    const coll = new Meteor.Collection(collName);
    await coll.insertAsync(obj1);
    await coll.insertAsync(obj2);

    const cursorHandler = createCursorHandler(function (id) {
      return coll.find({ _id: id });
    });

    Meteor.publish(pubName, async function (id) {
      check(id, String);
      return await cursorHandler.get(id);
    });

    FastRender.onAllRoutes(async function () {
      await this.subscribe(pubName, 'one');
    });

    FastRender.route(path, async function () {
      await this.subscribe(pubName, 'two');
    });

    const data = await getFRData(path);
    assert.isDefined(data.subscriptions[pubName]);
    assert.deepEqual(data.collectionData[collName][0][0], obj1);
    assert.deepEqual(data.collectionData[collName][1][0], obj2);
    cursorHandler.stop();
  });

  it('null publications', async function () {
    const collName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    await coll.insertAsync(obj);

    const cursorHandler = createCursorHandler(function () {
      return coll.find();
    });
    Meteor.publish(null, async function () {
      return await cursorHandler.get();
    });

    FastRender.route(path, function () { });

    const data = await getFRData(path);
    assert.deepEqual(data.collectionData[collName][0][0], obj);
    cursorHandler.stop();
  });

  it('send data via this.*apis', async function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    Meteor.publish(pubName, function () {
      const sub = this;
      const { _id, ...newObj } = obj;
      sub.added(collName, _id, newObj);
      Meteor.setTimeout(function () {
        sub.ready();
      }, 100);
    });

    FastRender.route(path, async function () {
      await this.subscribe(pubName);
    });

    const data = await getFRData(path);
    assert.isDefined(data.subscriptions[pubName]);
    assert.deepEqual(data.collectionData[collName][0][0], obj);
  });

  it('send delayed data via this.* apis', async function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    Meteor.publish(pubName, function () {
      const sub = this;
      Meteor.setTimeout(function () {
        const { _id, ...newObj } = obj;
        sub.added(collName, _id, newObj);
        sub.ready();
      }, 1000);
    });

    FastRender.route(path, async function () {
      await this.subscribe(pubName);
    });

    const data = await getFRData(path);
    assert.isUndefined(data.subscriptions[pubName]);
    assert.deepEqual(data.collectionData, {});
  });

  it('error inside a publication', async function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    await coll.insertAsync(obj);

    Meteor.publish(pubName, function () {
      throw new Error('some bad thing happens');
    });

    FastRender.route(path, async function () {
      await this.subscribe(pubName);
    });

    const data = await getFRData(path);
    assert.deepEqual(data.collectionData, {});
  });

  it('error inside a null publication', async function () {
    const collName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    await coll.insertAsync(obj);

    Meteor.publish(null, function () {
      throw new Error('some bad thing happens');
    });

    FastRender.route(path, function () { });
    const data = await getFRData(path);
    assert.deepEqual(data.collectionData, {});
  });
});

it('when path has no leading slash', function () {
  const path = Random.id();

  assert.throws(function () {
    FastRender.route(path, function () { });
  }, 'Error: path (' + path + ') must begin with a leading slash "/"');
});

async function getFRData (path) {
  const url = new URL(path, process.env.ROOT_URL).toString();
  const options = {
    headers: {
      Accept: 'text/html',
    },
  };
  const res = await fetch(url, options);
  const content = await res.text();
  const encodedData = content.match(/data">(.*)<\/script/)[1];
  return InjectData._decode(encodedData)['fast-render-data'];
}

function createCursorHandler (callback) {
  let stop = false;
  async function getFn () {
    if (stop) {
      return [];
    } else {
      return await callback.apply(this, arguments);
    }
  }

  function stopFn () {
    stop = true;
  }

  return {
    get: getFn,
    stop: stopFn,
  };
}
