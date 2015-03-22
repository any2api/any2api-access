var debug = require('debug')(require('../package.json').name);
var _ = require('lodash');
var fs = require('fs');
var tar = require('tar-fs');
var temp = require('temp'); //.track();
var path = require('path');
var childProc = require('child_process');
var shell = require('shelljs');
var Commands = require('./Commands');



var spawn = function(command, args, options) {
  console.log('spawn child', command, args, options);

  return childProc.spawn(command, args, options);
};



module.exports = function(spec) {
  debug('new instance of SSH', spec);

  spec = spec || {};
  spec.ssh_port = spec.ssh_port || 22;

  if (!_.isBoolean(spec.ssh_tty)) spec.ssh_tty = true;
  if (!_.isBoolean(spec.share_connection)) spec.share_connection = true;

  var privateKeyPath = temp.path({ prefix: "key-" });
  var socketPath = temp.path({ prefix: "socket-" });

  fs.writeFileSync(privateKeyPath, spec.ssh_private_key, { mode: 384 }); // 384 decimal = 600 octal

  var obj = {};

  //TODO: support password-based auth using 'sshpass'
  // prep: apt-get install sshpass
  //       yum install sshpass
  // exec: sshpass -p "YOUR_PASSWORD" ssh -o StrictHostKeyChecking=no YOUR_USERNAME@SOME_SITE.COM

  var sshOptions = [ '-i', privateKeyPath,
                     '-p', spec.ssh_port,
                     '-o', 'LogLevel=quiet',
                     '-o', 'StrictHostKeyChecking=no',
                     '-o', 'ConnectTimeout=10',
                     '-o', 'BatchMode=yes', // (?) remove 'BatchMode' option to support password-based authentication
                     '-o', 'UserKnownHostsFile=/dev/null',
                     spec.ssh_user + '@' + spec.ssh_host ];

  // http://puppetlabs.com/blog/speed-up-ssh-by-reusing-connections
  if (spec.share_connection) {
    sshOptions = [ '-o', 'ControlPath=' + socketPath ].concat(sshOptions);

    var child = spawn('ssh', [ '-o', 'ControlPath=' + socketPath,
                               '-o', 'ControlMaster=auto',
                               '-o', 'ControlPersist=60' ].concat(sshOptions).concat('true'));

    child.on('close', function(code) {
      console.log('ssh master exited with code ' + code);
    });
  }

  // force pseudo tty because some sudo configurations require that
  if (spec.ssh_tty) sshOptions = [ '-t', '-t', '-t' ].concat(sshOptions);

  var c = Commands();

  var defaultListeners = function(child, args, callback) {
    callback = _.once(callback);

    child.stderr.setEncoding(args.encodingStderr || 'utf8');

    if (args.printStdout) {
      child.stdout.on('data', function(chunk) {
        console.log(chunk);
      });
    }

    child.stderr.on('data', function(chunk) {
      console.error(chunk);
    });

    //child.stdin.on('finish', function() {});
    child.stdin.on('error', function(err) {
      callback(err);
    });
  };

  obj.readFile = function(args, callback) {
    args.data = '';

    var child = spawn('ssh', sshOptions.concat([ c.fileToStdout(args) ]), args.options);

    defaultListeners(child, args, callback);

    child.stdout.on('data', function(chunk) {
      args.data += chunk;
    });

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('readFile: ssh child process exited with code ' + code));
      else callback(null, args.data);
    });
  };

  obj.writeFile = function(args, callback) {
    var child = spawn('ssh', sshOptions.concat([ c.stdinToFile(args) ]), args.options);

    defaultListeners(child, args, callback);

    child.stdin.write(args.content);
    child.stdin.end();

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('writeFile: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.exists = function(args, callback) {
    var child = spawn('ssh', sshOptions.concat([ c.exists(args) ]), args.options);

    defaultListeners(child, args, callback);

    child.stdout.on('data', function(chunk) {
      args.data += chunk;
    });

    child.on('close', function(code) {
      if (code !== 0) callback(null, false);
      else callback(null, true);
    });
  };

  obj.mkdir = function(args, callback) {
    args.printStdout = true;

    var child = spawn('ssh', sshOptions.concat([ c.mkdir(args) ]), args.options);

    defaultListeners(child, args, callback);

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('mkdir: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.remove = function(args, callback) {
    args.printStdout = true;

    var child = spawn('ssh', sshOptions.concat([ c.rm(args) ]), args.options);

    defaultListeners(child, args, callback);

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('remove: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.move = function(args, callback) {
    args.printStdout = true;

    var child = spawn('ssh', sshOptions.concat([ c.mv(args) ]), args.options);

    defaultListeners(child, args, callback);

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('move: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.copy = function(args, callback) {
    args.printStdout = true;

    var child = spawn('ssh', sshOptions.concat([ c.cp(args) ]), args.options);

    defaultListeners(child, args, callback);

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('copy: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.copyDirFromRemote = function(args, callback) {
    args.path = args.sourcePath;

    try {
      shell.mkdir('-p', args.targetPath);
    } catch (err) {
      if (err) return callback(err);
    }

    var dirToTar = spawn('ssh', sshOptions.concat([ c.dirToTarStdout(args) ]), args.options);

    var writeStream = tar.extract(args.targetPath);

    defaultListeners(dirToTar, args, callback);

    dirToTar.stdin.pipe(writeStream).on('error', function(err) {
      callback(err);
    });

    dirToTar.on('close', function(code) {
      if (code !== 0) callback(new Error('copyDirFromRemote/dirToTar: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.copyDirToRemote = function(args, callback) {
    args.path = args.targetPath;

    obj.mkdir(_.clone(args), function(err) {
      if (err) return callback(err);

      var readStream = tar.pack(args.sourcePath);

      var tarToDir = spawn('ssh', sshOptions.concat([ c.stdinTarToDir(args) ]), args.options);

      defaultListeners(tarToDir, args, callback);

      readStream.pipe(tarToDir.stdin).on('error', function(err) {
        callback(err);
      });

      tarToDir.on('close', function(code) {
        if (code !== 0) callback(new Error('copyDirToRemote/tarToDir: ssh child process exited with code ' + code));
        else callback();
      });
    });
  };

  obj.exec = function(args, callback) {
    args = args || {};
    args.options = args.options || {};

    args.env = args.env || args.options.env;
    args.path = args.path || args.options.path || args.options.cwd;

    var stdout = '';
    var stderr = '';

    var child = spawn('ssh', sshOptions.concat([ c.cmd(args) ]));

    defaultListeners(child, args, callback);

    if (args.stdin) {
      child.stdin.write(args.stdin);
      child.stdin.end();
    }

    child.stdout.on('data', function(chunk) {
      stdout += chunk;
    });

    child.stderr.on('data', function(chunk) {
      stderr += chunk;
    });

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('exec: ssh child process exited with code ' + code), stdout, stderr);
      else callback(null, stdout, stderr);
    });
  };

  obj.terminate = function(callback) {
    var child = spawn('ssh', [ '-O', 'exit',
                               '-S', socketPath,
                               spec.ssh_user + '@' + spec.ssh_host ]);

    child.on('close', function(code) {
      console.log('ssh master exit trigger exited with code ' + code);

      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
      if (fs.existsSync(privateKeyPath)) fs.unlinkSync(privateKeyPath);

      if (callback) callback();
    });
  };

  return obj;
};
