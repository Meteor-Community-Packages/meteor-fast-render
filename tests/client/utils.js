/* eslint-env mocha */
import { FastRender } from 'meteor/communitypackages:fast-render';
import { assert } from 'chai';

describe('AddedToChanged', function () {
  it('new fields', function () {
    const localCopy = { aa: 10 };
    const added = { fields: { aa: 20, bb: 20 }, msg: 'added' };

    FastRender._AddedToChanged(localCopy, added);

    assert.equal(added.msg, 'changed');
    assert.deepEqual(added.fields, { aa: 20, bb: 20 });
  });
  it('removed fields', function () {
    const localCopy = { aa: 10, cc: 20, bb: 10 };
    const added = { fields: { bb: 20 }, msg: 'added' };

    FastRender._AddedToChanged(localCopy, added);

    assert.equal(added.msg, 'changed');
    assert.deepEqual(added.fields, { bb: 20 });
    assert.deepEqual(added.cleared, ['aa', 'cc']);
  });
});
