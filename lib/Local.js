var debug = require('debug')(require('../package.json').name);
var _ = require('lodash');
var fs = require('fs-extra');
var path = require('path');
var exec = require('child_process').exec;



module.exports = function(spec) {
  debug('new instance of Local', spec);

  spec = spec || {};

  var obj = {};

  obj.readFile = function(args, callback) {
    args.options = args.options || {};

    fs.readFile(args.path, args.options, callback);
  };

  obj.writeFile = function(args, callback) {
    args.options = args.options || {};

    fs.writeFile(args.path, args.content, args.options, callback);
  };

  obj.exists = function(args, callback) {
    fs.exists(args.path, function(exists) {
      callback(null, exists);
    });
  };

  obj.mkdir = function(args, callback) {
    fs.mkdirs(args.path, callback);
  };

  obj.remove = function(args, callback) {
    fs.remove(args.path, callback);
  };

  obj.move = function(args, callback) {
    args.options = args.options || {};

    fs.move(args.sourcePath, args.targetPath, args.options, callback);
  };

  obj.copy = function(args, callback) {
    args.options = args.options || {};

    fs.copy(args.sourcePath, args.targetPath, args.options, callback);
  };

  obj.copyDirFromRemote = obj.copy;
  obj.copyDirToRemote = obj.copy;

  obj.exec = function(args, callback) {
    debug('command to be executed locally', args);

    args.options = args.options || {};

    var child = exec(args.command, args.options, function(err, stdout, stderr) {
      callback(err, stdout, stderr);
    });

    if (args.stdin) {
      child.stdin.write(args.stdin);
      child.stdin.end();
    }
  };

  obj.terminate = function(args, callback) {
    if (callback) callback();
  };

  return obj;
};
