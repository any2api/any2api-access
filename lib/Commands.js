var _ = require('lodash');

var templates = {
  unix: {
    cd: 'cd <%= path %> ; ',
    env: '<% _.forEach(env, function(value, name) { print("export " + name + "=\'" + value + "\' ; "); }); %>',
    cmd: '<% if (stdin) { %> echo \'<%= stdin %>\' | <% } %> <%= command %>',

    sudo: '<% if (password) { %> echo <%= password %> | <% } %> sudo <% if (user) { %> -u <%= user %> <% } %> -S -k sh -c "<%= command %>"',

    mkdir: 'mkdir -p <%= path %> <% if (mode) { %> ; chmod <%= mode %> <%= path %> <% } %>',
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


module.exports = function(spec) {
  spec = spec || {};
  spec.os = spec.os || 'unix';

  var templateResolver = function(cmd) {
    return function(args) {
      var sudo = args.sudo || spec.sudo;

      if (!_.isBoolean(sudo)) sudo = true;

      args.user = args.user || null;
      args.password = args.password || null;
      args.stdin = args.stdin || null;
      args.mode = args.mode || null;
      args.env = args.env || {};

      if (templates[spec.os][cmd]) {
        args.command = _.template(templates[spec.os][cmd])(args);
      } else {
        args.command = cmd;
      }

      if (sudo) {
        //args.command = args.command.replace(/"/g, '\\"');
        return _.template(templates[spec.os].sudo)(args);
      } else {
        return args.command;
      }
    };
  };

  var obj = {};

  //TODO: the commands stdinToFile and stdinTarToDir in conjunction with sudo
  //      may interfere with 'password' and 'stdin' parameters
  _.each([ 'mkdir', 'exists', 'rm', 'mv', 'cp', 'chmod', 'chown',
           'stdinToFile', 'fileToStdout', 'stdinTarToDir', 'dirToTarStdout' ], function(cmd) {
    obj[cmd] = templateResolver(cmd);
  });

  obj.cmd = function(args) {
    if (args.path && args.env) {
      args.command = _.template(templates[spec.os].cd)(args) +
                     _.template(templates[spec.os].env)(args); +
                     _.template(templates[spec.os].cmd)(args);
    } else if (args.path) {
      args.command = _.template(templates[spec.os].cd)(args) +
                     _.template(templates[spec.os].cmd)(args);
    } else if (args.env) {
      args.command = _.template(templates[spec.os].env)(args); +
                     _.template(templates[spec.os].cmd)(args);
    }

    return templateResolver(args.command)(args);
  };

  return obj;
};
