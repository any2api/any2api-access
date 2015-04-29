var debug = require('debug')(require('../package.json').name);
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');
var tar = require('tar-fs');
var exec = require('child_process').exec;



module.exports = function(spec) {
  debug('new instance of Local', spec);

  spec = spec || {};

  var obj = {};

  obj.readFile = function(args, callback) {
    args = args || {};

    fs.readFile(args.path, args, callback);
  };

  obj.writeFile = function(args, callback) {
    args = args || {};

    fs.writeFile(args.path, args.content, args, callback);
  };

  obj.exists = function(args, callback) {
    args = args || {};

    fs.exists(args.path, function(exists) {
      callback(null, exists);
    });
  };

  obj.mkdir = function(args, callback) {
    args = args || {};

    fs.mkdirs(args.path, callback);
  };

  obj.remove = function(args, callback) {
    args = args || {};

    fs.remove(args.path, callback);
  };

  obj.move = function(args, callback) {
    args = args || {};

    fs.remove(args.targetPath, function(err) {
      if (err) return callback(err);

      fs.move(args.sourcePath, args.targetPath, args, callback);
    });
  };

  obj.copy = function(args, callback) {
    args = args || {};

    fs.copy(args.sourcePath, args.targetPath, args, callback);
  };

  obj.copyDirFromRemote = obj.copy;
  obj.copyDirToRemote = obj.copy;

  obj.fileReadStream = function(args) {
    args = args || {};

    return fs.createReadStream(args.path, args);
  };

  obj.fileWriteStream = function(args) {
    args = args || {};

    return fs.createWriteStream(args.path, args);
  };

  obj.tarPackReadStream = function(args) {
    args = args || {};

    return tar.pack(args.path, args);
  };

  obj.tarExtractWriteStream = function(args) {
    args = args || {};

    fs.mkdirsSync(args.path);

    return tar.extract(args.path, args);
  };

  obj.exec = function(args, callback) {
    debug('command to be executed locally', args);

    args = args || {};
    args.cwd = args.path || args.cwd;
    args.env = args.env || {};
    args.encoding = args.encodingStdout || args.encodingStderr || 'utf8';

    _.each([ 'PATH', 'HOME', 'HOMEPATH', 'USERPROFILE',
             'OLDPWD', 'PWD', 'TERM', 'HOSTNAME' ], function(name) {
      if (!args.env[name] && process.env[name]) {
        args.env[name] = process.env[name];
      }
    });

    //TODO: use spawn instead of exec
    var child = exec(args.command, args, function(err, stdout, stderr) {
      if (args.encodingStdout && Buffer.isBuffer(stdout)) {
        stdout = stdout.toString(args.encodingStdout);
      }

      if (args.encodingStderr && Buffer.isBuffer(stderr)) {
        stderr = stderr.toString(args.encodingStderr);
      }

      //if (stdout && args.printStdout) console.log(stdout);

      //if (stderr && args.printStderr) console.error(stderr);

      callback(err, stdout, stderr);
    });

    if (args.stdin) {
      child.stdin.write(args.stdin, args.encodingStdin);
      child.stdin.end();
    }
  };

  obj.terminate = function(callback) {
    if (callback) callback();
  };

  return obj;
};
