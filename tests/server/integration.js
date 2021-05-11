/* eslint-env mocha */
import { FastRender } from 'meteor/communitypackages:fast-render';
import { InjectData } from 'meteor/communitypackages:inject-data';
import { Random } from 'meteor/random';
import { Meteor } from 'meteor/meteor';
import { HTTP } from 'meteor/http';
import { check } from 'meteor/check';
import { assert } from 'chai';
import { URL } from 'url';

describe('integration', function () {
  it('a simple route', function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    coll.insert(obj);

    Meteor.publish(pubName, function () {
      return coll.find();
    });

    FastRender.route(path, function () {
      this.subscribe(pubName);
    });

    const data = getFRData(path);
    assert.isDefined(data.subscriptions[pubName]);
    assert.deepEqual(data.collectionData[collName][0][0], obj);
  });

  it('onAllRoutes', function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    coll.insert(obj);

    const cursorHandler = createCursorHandler(function () {
      return coll.find();
    });

    Meteor.publish(pubName, function () {
      return cursorHandler.get();
    });
    FastRender.route(path, function () { });
    FastRender.onAllRoutes(function () {
      this.subscribe(pubName);
    });

    const data = getFRData(path);
    assert.isDefined(data.subscriptions[pubName]);
    assert.deepEqual(data.collectionData[collName][0][0], obj);
    cursorHandler.stop();
  });

  it('onAllRoutes + route', function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj1 = { _id: 'one', aa: 10 };
    const obj2 = { _id: 'two', aa: 10 };

    const coll = new Meteor.Collection(collName);
    coll.insert(obj1);
    coll.insert(obj2);

    const cursorHandler = createCursorHandler(function (id) {
      return coll.find({ _id: id });
    });

    Meteor.publish(pubName, function (id) {
      check(id, String);
      return cursorHandler.get(id);
    });

    FastRender.onAllRoutes(function () {
      this.subscribe(pubName, 'one');
    });

    FastRender.route(path, function () {
      this.subscribe(pubName, 'two');
    });

    const data = getFRData(path);
    assert.isDefined(data.subscriptions[pubName]);
    assert.deepEqual(data.collectionData[collName][0][0], obj1);
    assert.deepEqual(data.collectionData[collName][1][0], obj2);
    cursorHandler.stop();
  });

  it('null publications', function () {
    const collName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    coll.insert(obj);

    const cursorHandler = createCursorHandler(function () {
      return coll.find();
    });
    Meteor.publish(null, function () {
      return cursorHandler.get();
    });

    FastRender.route(path, function () { });

    const data = getFRData(path);
    assert.deepEqual(data.collectionData[collName][0][0], obj);
    cursorHandler.stop();
  });

  it('send data via this.*apis', function () {
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

    FastRender.route(path, function () {
      this.subscribe(pubName);
    });

    const data = getFRData(path);
    assert.isDefined(data.subscriptions[pubName]);
    assert.deepEqual(data.collectionData[collName][0][0], obj);
  });

  it('send delayed data via this.* apis', function () {
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

    FastRender.route(path, function () {
      this.subscribe(pubName);
    });

    const data = getFRData(path);
    assert.isUndefined(data.subscriptions[pubName]);
    assert.deepEqual(data.collectionData, {});
  });

  it('error inside a publication', function () {
    const collName = Random.id();
    const pubName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    coll.insert(obj);

    Meteor.publish(pubName, function () {
      throw new Error('some bad thing happens');
    });

    FastRender.route(path, function () {
      this.subscribe(pubName);
    });

    const data = getFRData(path);
    assert.deepEqual(data.collectionData, {});
  });

  it('error inside a null publication', function () {
    const collName = Random.id();
    const path = '/' + Random.id();
    const obj = { _id: 'one', aa: 10 };

    const coll = new Meteor.Collection(collName);
    coll.insert(obj);

    Meteor.publish(null, function () {
      throw new Error('some bad thing happens');
    });

    FastRender.route(path, function () { });
    const data = getFRData(path);
    assert.deepEqual(data.collectionData, {});
  });
});

it('when path has no leading slash', function () {
  const path = Random.id();

  assert.throws(function () {
    FastRender.route(path, function () { });
  }, 'Error: path (' + path + ') must begin with a leading slash "/"');
});

function getFRData (path) {
  const url = new URL(path, process.env.ROOT_URL).toString();
  const options = {
    headers: {
      Accept: 'text/html',
    },
  };
  const res = HTTP.get(url, options);
  const encodedData = res.content.match(/data">(.*)<\/script/)[1];
  return InjectData._decode(encodedData)['fast-render-data'];
}

function createCursorHandler (callback) {
  let stop = false;
  function getFn () {
    if (stop) {
      return [];
    } else {
      return callback.apply(this, arguments);
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
