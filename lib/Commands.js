var _ = require('lodash');

var templates = {
  unix: {
    cd: 'cd <%= path %> ; ',
    env: '<% _.forEach(env, function(value, name) { print("export " + name + "=\\"" + value + "\\" ; "); }); %>',
    cmd: '<% if (stdin) { %> echo \'<%= stdin %>\' | <% } %> <%= command %>',

    sudo: '<% if (sudo_password) { %> echo <%= sudo_password %> | <% } %> sudo <% if (sudo_user) { %> -u <%= sudo_user %> <% } %> -S -k sh -c \'<%= command %>\'',

    mkdir: 'mkdir -p <%= path %> <% if (owner) { %> ; chown -R <%= owner %> <%= path %> <% } %> <% if (mode) { %> ; chmod -R <%= mode %> <%= path %> <% } %>',
    exists: 'test -e <%= path %>',
    rm: 'rm -rf <%= path %>',
    cp: 'rm -rf <%= targetPath %> ; cp -a <%= sourcePath %> <%= targetPath %>',
    mv: 'rm -rf <%= targetPath %> ; mv <%= sourcePath %> <%= targetPath %>',
    chmod: 'chmod -R <%= mode %> <%= targetPath %>',
    chown: 'chown -R <%= owner %> <%= targetPath %>',

    stdinToFile: 'cat - > <%= path %>',
    fileToStdout: 'cat <%= path %>',
    stdinTarToDir: 'tar -C <%= path %> -xvf -',
    dirToTarStdout: 'tar -cf - <%= path %>'
  }
};

var prepareArgs = function(args) {
  args.sudo_user = args.sudo_user || null;
  args.sudo_password = args.sudo_password || null;
  args.stdin = args.stdin || null;
  args.owner = args.owner || null;
  args.mode = args.mode || null;
  args.env = args.env || {};

  return args;
};



module.exports = function(spec) {
  spec = spec || {};
  spec.os = spec.os || 'unix';

  if (spec.sudo_all) spec.sudo_all = JSON.parse(spec.sudo_all);

  if (spec.sudo_exec) spec.sudo_exec = JSON.parse(spec.sudo_exec);

  var templateResolver = function(cmd) {
    return function(args) {
      args.sudo_all = args.sudo_all || spec.sudo_all;
      args.sudo_exec = args.sudo_exec || spec.sudo_exec;

      prepareArgs(args);

      if (templates[spec.os][cmd]) {
        args.command = _.template(templates[spec.os][cmd])(args);
      } else {
        args.command = cmd;
      }

      if (args.sudo_all || (args.sudo_exec && args.command === cmd)) {
        //args.command = args.command.replace(/'/g, "\\'");
        return _.template(templates[spec.os].sudo)(args);
      } else {
        return args.command;
      }
    };
  };

  var obj = {};

  //TODO: the commands stdinToFile and stdinTarToDir in conjunction with sudo
  //      may interfere with 'sudo_password' and 'stdin' parameters
  _.each([ 'mkdir', 'exists', 'rm', 'mv', 'cp', 'chmod', 'chown',
           'stdinToFile', 'fileToStdout', 'stdinTarToDir', 'dirToTarStdout' ], function(cmd) {
    obj[cmd] = templateResolver(cmd);
  });

  obj.cmd = function(args) {
    prepareArgs(args);

    var preCommand = '';

    if (args.path && args.env) {
      preCommand = _.template(templates[spec.os].cd)(args) +
                   _.template(templates[spec.os].env)(args);
    } else if (args.path) {
      preCommand = _.template(templates[spec.os].cd)(args);
    } else if (args.env) {
      preCommand = _.template(templates[spec.os].env)(args);
    }

    args.command = preCommand + _.template(templates[spec.os].cmd)(args);

    return templateResolver(args.command)(args);
  };

  return obj;
};
