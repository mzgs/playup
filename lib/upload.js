'use strict';

Object.defineProperty(exports, '__esModule', {
  value: true
});

var _createClass = (function () { function defineProperties(target, props) { for (var i = 0; i < props.length; i++) { var descriptor = props[i]; descriptor.enumerable = descriptor.enumerable || false; descriptor.configurable = true; if ('value' in descriptor) descriptor.writable = true; Object.defineProperty(target, descriptor.key, descriptor); } } return function (Constructor, protoProps, staticProps) { if (protoProps) defineProperties(Constructor.prototype, protoProps); if (staticProps) defineProperties(Constructor, staticProps); return Constructor; }; })();

function _interopRequireDefault(obj) { return obj && obj.__esModule ? obj : { 'default': obj }; }

function _classCallCheck(instance, Constructor) { if (!(instance instanceof Constructor)) { throw new TypeError('Cannot call a class as a function'); } }

var _fs = require('fs');

var _debug = require('debug');

var _debug2 = _interopRequireDefault(_debug);

var _nodeApkParser = require('node-apk-parser');

var _nodeApkParser2 = _interopRequireDefault(_nodeApkParser);

var _googleapis = require('googleapis');

var _assert = require('assert');

var _assert2 = _interopRequireDefault(_assert);

var debug = (0, _debug2['default'])('playup');
var publisher = (0, _googleapis.androidpublisher)('v2');
var versionCodes = [];

var Upload = (function () {
  function Upload(client, apk) {
    var params = arguments.length <= 2 || arguments[2] === undefined ? { track: 'alpha', obbs: [], recentChanges: {} } : arguments[2];

    _classCallCheck(this, Upload);

    (0, _assert2['default'])(client, 'I require a client');
    (0, _assert2['default'])(apk, 'I require an APK route');
    (0, _assert2['default'])(Upload.tracks.indexOf(params.track) !== -1, 'Unknown track');

    this.client = client;

    this.apk = typeof apk === 'string' ? [apk] : apk;
    this.track = params.track;
    this.obbs = params.obbs;
    this.recentChanges = params.recentChanges;
  }

  _createClass(Upload, [{
    key: 'publish',
    value: function publish() {
      var _this = this;

      return this.parseManifest().then(function () {
        return _this.authenticate();
      }).then(function () {
        return _this.createEdit();
      }).then(function () {
        return _this.uploadAPK();
      }).then(function () {
        return _this.uploadOBBs();
      }).then(function () {
        return _this.assignTrack();
      }).then(function () {
        return _this.sendRecentChanges();
      }).then(function () {
        return _this.commitChanges();
      }).then(function () {
        return {
          packageName: _this.packageName,
          versionCode: _this.versionCode
        };
      });
    }
  }, {
    key: 'parseManifest',
    value: function parseManifest() {
      var _this2 = this;

      debug('> Parsing manifest');
      // Wrapping in promise because apkParser throws in case of error
      return Promise.resolve().then(function () {
        var reader = _nodeApkParser2['default'].readFile(_this2.apk[0]);
        var manifest = reader.readManifestSync();
        _this2.packageName = manifest['package'];
        _this2.versionCode = manifest.versionCode;
        debug('> Detected package name %s', _this2.packageName);
        debug('> Detected version code %d', _this2.versionCode);
      });
    }
  }, {
    key: 'authenticate',
    value: function authenticate() {
      var _this3 = this;

      debug('> Authenticating');
      return new Promise(function (done, reject) {
        _this3.client.authorize(function (err) {
          if (err) return reject(err);
          debug('> Authenticated succesfully');
          done();
        });
      });
    }
  }, {
    key: 'createEdit',
    value: function createEdit() {
      var _this4 = this;

      debug('> Creating edit');
      return new Promise(function (done, reject) {
        publisher.edits.insert({
          packageName: _this4.packageName,
          auth: _this4.client
        }, function (err, edit) {
          if (err) return reject(err);
          if (!edit) return reject(new Error('Unable to create edit'));
          debug('> Created edit with id %d', edit.id);
          _this4.editId = edit.id;
          done();
        });
      });
    }
  }, {
    key: 'uploadAPK',
    value: function uploadAPK() {
      debug('> Uploading release');
      var that = this;
      var uploads = this.apk.map(function (apk) {
        return new Promise(function (done, rejectApk) {
          publisher.edits.apks.upload({
            packageName: that.packageName,
            editId: that.editId,
            auth: that.client,
            media: {
              mimeType: 'application/vnd.android.package-archive',
              body: (0, _fs.createReadStream)(apk)
            }
          }, function (err, upload) {
            if (err) return rejectApk(err);
            versionCodes = [];
            debug('> Uploaded %s with version code %d and SHA1 %s', apk, upload.versionCode, upload.binary.sha1);
            versionCodes.push(upload.versionCode);
            done();
          });
        });
      });
      return Promise.all(uploads);
    }
  }, {
    key: 'uploadOBBs',
    value: function uploadOBBs() {
      var _this5 = this;

      if (!this.obbs || !Array.isArray(this.obbs) || !this.obbs.length) return Promise.resolve();

      debug('> Uploading %d expansion file(s)', this.obbs.length);
      var current = Promise.resolve();

      return Promise.all(this.obbs.map(function (obb) {
        current = current.then(_this5.uploadOBB(obb));
        return current;
      }));
    }
  }, {
    key: 'uploadOBB',
    value: function uploadOBB(obb) {
      var _this6 = this;

      debug('Uploading expansion file %s', obb);
      return new Promise(function (resolve, reject) {
        publisher.edits.expansionfiles.upload({
          packageName: _this6.packageName,
          editId: _this6.editId,
          apkVersionCode: _this6.versionCode,
          expansionFileType: 'main',
          auth: _this6.client,
          media: {
            mimeType: 'application/octet-stream',
            body: (0, _fs.createReadStream)(obb)
          }
        }, function (err) {
          if (err) return reject(err);
          resolve();
        });
      });
    }
  }, {
    key: 'assignTrack',
    value: function assignTrack() {
      var _this7 = this;

      return new Promise(function (resolve, reject) {
        debug('> Assigning APK to %s track', _this7.track);
        publisher.edits.tracks.update({
          packageName: _this7.packageName,
          editId: _this7.editId,
          track: _this7.track,
          resource: {
            versionCodes: versionCodes
          },
          auth: _this7.client
        }, function (err, track) {
          if (err) return reject(err);
          debug('> Assigned APK to %s track', track.track);
          resolve();
        });
      });
    }
  }, {
    key: 'sendRecentChanges',
    value: function sendRecentChanges() {
      var _this8 = this;

      if (!this.recentChanges || !Object.keys(this.recentChanges).length) return Promise.resolve();
      debug('> Adding what changed');

      var current = Promise.resolve();
      return Promise.all(Object.keys(this.recentChanges).map(function (lang) {
        current = current.then(_this8.sendRecentChange(lang));
        return current;
      }));
    }
  }, {
    key: 'sendRecentChange',
    value: function sendRecentChange(lang) {
      var _this9 = this;

      return new Promise(function (done, reject) {
        var changes = _this9.recentChanges[lang];
        publisher.edits.apklistings.update({
          apkVersionCode: _this9.versionCode,
          editId: _this9.editId,
          language: lang,
          packageName: _this9.packageName,
          resource: {
            recentChanges: changes
          },
          auth: _this9.client
        }, function (err, edit) {
          if (err) return reject(err);
          debug('> Added recent changes for %s', lang);
          done();
        });
      });
    }
  }, {
    key: 'commitChanges',
    value: function commitChanges() {
      var _this10 = this;

      debug('> Commiting changes');
      return new Promise(function (done, reject) {
        publisher.edits.commit({
          editId: _this10.editId,
          packageName: _this10.packageName,
          auth: _this10.client
        }, function (err, commit) {
          if (err) return reject(err);
          debug('> Commited changes');
          done();
        });
      });
    }
  }]);

  return Upload;
})();

exports['default'] = Upload;

Upload.tracks = ['alpha', 'beta', 'production', 'rollout'];
module.exports = exports['default'];
