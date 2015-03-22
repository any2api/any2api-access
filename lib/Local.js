var debug = require('debug')(require('../package.json').name);
var _ = require('lodash');
var fs = require('fs');
var path = require('path');
var exec = require('child_process').exec;
var shell = require('shelljs');



module.exports = function(spec) {
  debug('new instance of Local', spec);

  spec = spec || {};

  var obj = {};

  obj.readFile = function(args, callback) {
    args = args || {};
    args.options = args.options || {};

    fs.readFile(args.path, args.options, callback);
  };

  obj.writeFile = function(args, callback) {
    args = args || {};

    args.options = args.options || {};

    fs.writeFile(args.path, args.content, args.options, callback);
  };

  obj.exists = function(args, callback) {
    args = args || {};

    fs.exists(args.path, function(exists) {
      callback(null, exists);
    });
  };

  obj.mkdir = function(args, callback) {
    args = args || {};

    try {
      shell.mkdir('-p', args.path);
    } catch (err) {
      if (err) return callback(err);
    }

    callback();
  };

  obj.remove = function(args, callback) {
    args = args || {};

    try {
      shell.rm('-rf', args.path);
    } catch (err) {
      if (err) return callback(err);
    }

    callback();
  };

  obj.move = function(args, callback) {
    args = args || {};

    try {
      shell.mv('-f', path.join(args.sourcePath, '*'), args.targetPath);
    } catch (err) {
      if (err) return callback(err);
    }

    callback();
  };

  obj.copy = function(args, callback) {
    args = args || {};

    try {
      shell.cp('-rf', path.join(args.sourcePath, '*'), args.targetPath);
    } catch (err) {
      if (err) return callback(err);
    }

    callback();
  };

  obj.copyDirFromRemote = obj.copy;
  obj.copyDirToRemote = obj.copy;

  obj.exec = function(args, callback) {
    debug('command to be executed locally', args);

    args = args || {};
    args.options = args.options || {};
    args.options.cwd = args.path || args.options.path || args.options.cwd;
    args.options.env = args.env || args.options.env || {};

    _.each([ 'PATH', 'HOME', 'HOMEPATH', 'USERPROFILE',
             'OLDPWD', 'PWD', 'TERM', 'HOSTNAME' ], function(name) {
      if (!args.options.env[name] && process.env[name]) {
        args.options.env[name] = process.env[name];
      }
    });

    var child = exec(args.command, args.options, function(err, stdout, stderr) {
      callback(err, stdout, stderr);
    });

    if (args.stdin) {
      child.stdin.write(args.stdin);
      child.stdin.end();
    }
  };

  obj.terminate = function(callback) {
    if (callback) callback();
  };

  return obj;
};
