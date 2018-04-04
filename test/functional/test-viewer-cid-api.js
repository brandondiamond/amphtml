/**
 * Copyright 2017 The AMP HTML Authors. All Rights Reserved.
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *      http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS-IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */


import {ViewerCidApi} from '../../src/service/viewer-cid-api';
import {dict} from '../../src/utils/object';
import {mockServiceForDoc} from '../../testing/test-helper';

describes.realWin('viewerCidApi', {amp: true}, env => {
  let ampdoc;
  let api;
  let sandbox;
  let viewerMock;

  beforeEach(() => {
    ampdoc = env.ampdoc;
    sandbox = env.sandbox;
    viewerMock = mockServiceForDoc(sandbox, ampdoc, 'viewer', [
      'sendMessageAwaitResponse',
      'hasCapability',
      'isTrustedViewer',
    ]);

    api = new ViewerCidApi(env.ampdoc);
  });

  describe('isSupported', () => {
    it('should return true if Viewer is trusted and has CID capability', () => {
      viewerMock.isTrustedViewer.returns(Promise.resolve(true));
      viewerMock.hasCapability.withArgs('cid').returns(true);
      return expect(api.isSupported()).to.eventually.be.true;
    });

    it('should return false if Viewer has no CID capability', () => {
      viewerMock.isTrustedViewer.returns(new Promise(() => {}));
      viewerMock.hasCapability.withArgs('cid').returns(false);
      return expect(api.isSupported()).to.eventually.be.false;
    });

    it('should return false if Viewer is not trusted', () => {
      viewerMock.isTrustedViewer.returns(Promise.resolve(false));
      viewerMock.hasCapability.withArgs('cid').returns(true);
      return expect(api.isSupported()).to.eventually.be.false;
    });
  });

  describe('getScopedCid', () => {
    function verifyClientIdApiInUse(used) {
      viewerMock.sendMessageAwaitResponse
          .returns(Promise.resolve('client-id-from-viewer'));
      return api.getScopedCid('AMP_ECID_GOOGLE').then(cid => {
        expect(cid).to.equal('client-id-from-viewer');
        const payload = dict({
          'scope': 'AMP_ECID_GOOGLE',
          'clientIdApi': used,
          'canonicalOrigin': 'http://localhost:9876',
        });
        if (used) {
          payload['apiKey'] = 'AIzaSyA65lEHUEizIsNtlbNo-l2K18dT680nsaM';
        }
        expect(viewerMock.sendMessageAwaitResponse)
            .to.be.calledWith('cid', payload);
      });
    }

    it('should use client ID API from api if everything great', () => {
      ampdoc.win.document.head.innerHTML +=
          '<meta name="amp-google-client-id-api" content="googleanalytics">';
      return verifyClientIdApiInUse(true);
    });

    it('should not use client ID API if no opt in meta tag', () => {
      return verifyClientIdApiInUse(false);
    });

    // TODO(lannka, #14336): Fails due to console errors.
    it.skip('should not use client ID API if vendor not whitelisted', () => {
      ampdoc.win.document.head.innerHTML +=
          '<meta name="amp-google-client-id-api" content="abodeanalytics">';
      return verifyClientIdApiInUse(false);
    });

    it('should not use client ID API if scope not whitelisted', () => {
      ampdoc.win.document.head.innerHTML +=
          '<meta name="amp-google-client-id-api" content="googleanalytics">';
      viewerMock.sendMessageAwaitResponse.withArgs('cid', dict({
        'scope': 'NON_WHITELISTED_SCOPE',
        'clientIdApi': false,
        'canonicalOrigin': 'http://localhost:9876',
      })).returns(Promise.resolve('client-id-from-viewer'));
      return expect(api.getScopedCid('NON_WHITELISTED_SCOPE'))
          .to.eventually.equal('client-id-from-viewer');
    });

    it('should return undefined if Viewer returns undefined', () => {
      ampdoc.win.document.head.innerHTML +=
          '<meta name="amp-google-client-id-api" content="googleanalytics">';
      viewerMock.sendMessageAwaitResponse.returns(Promise.resolve());
      return expect(api.getScopedCid('AMP_ECID_GOOGLE'))
          .to.eventually.be.undefined;
    });

    it('should reject if Viewer rejects', () => {
      ampdoc.win.document.head.innerHTML +=
          '<meta name="amp-google-client-id-api" content="googleanalytics">';
      viewerMock.sendMessageAwaitResponse
          .returns(Promise.reject('Client API error'));
      return expect(api.getScopedCid('AMP_ECID_GOOGLE'))
          .to.eventually.be.rejectedWith(/Client API error/);
    });
  });

  describe('isScopeOptedIn', () => {
    it('should read predefined clients and custom API keys correctly', () => {
      ampdoc.win.document.head.innerHTML +=
          '<meta name="amp-google-client-id-api" ' +
          'content="googleanalytics, ' +
          'foo = foo-api-key,' +
          'bar=bar-api-key ,' +
          'hello=hello-api-key">';
      expect(api.isScopeOptedIn('AMP_ECID_GOOGLE'))
          .to.equal('AIzaSyA65lEHUEizIsNtlbNo-l2K18dT680nsaM');
      expect(api.isScopeOptedIn('foo')).to.equal('foo-api-key');
      expect(api.isScopeOptedIn('bar')).to.equal('bar-api-key');
      expect(api.isScopeOptedIn('hello')).to.equal('hello-api-key');
      expect(api.isScopeOptedIn('non-existing')).to.be.undefined;
    });

    it('should work if meta only contains predefined clients', () => {
      ampdoc.win.document.head.innerHTML +=
          '<meta name="amp-google-client-id-api" content="googleanalytics">';
      expect(api.isScopeOptedIn('AMP_ECID_GOOGLE'))
          .to.equal('AIzaSyA65lEHUEizIsNtlbNo-l2K18dT680nsaM');
    });

    it('should work if meta only contains custom scopes', () => {
      ampdoc.win.document.head.innerHTML +=
          '<meta name="amp-google-client-id-api" ' +
          'content="' +
          'foo=foo-api-key,' +
          'bar=bar-api-key">';
      expect(api.isScopeOptedIn('foo')).to.equal('foo-api-key');
      expect(api.isScopeOptedIn('bar')).to.equal('bar-api-key');
    });
  });
});
