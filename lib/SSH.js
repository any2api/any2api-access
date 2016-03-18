var debug = require('debug')(require('../package.json').name);
var _ = require('lodash');
var fs = require('fs-extra');
var tar = require('tar-fs');
var temp = require('temp'); //.track();
var path = require('path');
var through2 = require('through2');
var childProc = require('child_process');
var Commands = require('./Commands');



var logFile = './any2api-access-ssh.log';

var log = function(message) {
  if (_.isObject(message)) message = JSON.stringify(message, null, 2) + '\n\n';

  fs.appendFile(logFile, message, function(err) {
    if (err) console.error(err);
  });
};

var spawn = function(command, cmdArgs, spawnArgs) {
  log([ 'spawn child', command, cmdArgs, spawnArgs ]);

  return childProc.spawn(command, cmdArgs, spawnArgs);
};



module.exports = function(spec) {
  debug('new instance of SSH', spec);

  spec = spec || {};
  spec.ssh_port = spec.ssh_port || 22;

  if (!_.isBoolean(spec.ssh_tty)) spec.ssh_tty = true;
  if (!_.isBoolean(spec.share_connection)) spec.share_connection = true;

  var privateKeyPath = temp.path({ prefix: 'key-' });
  var socketPath = temp.path({ prefix: 'socket-' });

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
      log('ssh master exited with code ' + code);
    });
  }

  // force pseudo tty because some sudo configurations require that
  if (spec.ssh_tty) sshOptions = [ '-t', '-t', '-t' ].concat(sshOptions);

  if (spec.sudo_all) spec.sudo_all = JSON.parse(spec.sudo_all);
  else spec.sudo_all = true;

  var c = Commands(spec);

  var defaultListeners = function(child, args, callback) {
    callback = callback || function(err) { console.error(err); };
    callback = _.once(callback);

    if (args.encodingStderr !== 'buffer') child.stderr.setEncoding(args.encodingStderr || 'utf8');

    if (args.encodingStdout) child.stdout.setEncoding(args.encodingStdout);
    //else if (args.printStdout && !args.encodingStdout) child.stdout.setEncoding('utf8');

    //if (args.printStdout) child.stdout.pipe(process.stdout);

    if (args.encodingStderr !== 'buffer') child.stderr.pipe(process.stderr);

    //child.stdin.on('finish', function() {});
    child.stdin.on('error', function(err) {
      callback(err);
    });

    child.on('error', function(err) {
      callback(err);
    });
  };

  obj.readFile = function(args, callback) {
    args = args || {};

    var content = [];

    var child = spawn('ssh', sshOptions.concat([ c.fileToStdout(args) ]), args);

    defaultListeners(child, args, callback);

    if (args.encoding) {
      content = '';
      child.stdout.setEncoding(args.encoding);
    }

    child.stdout.on('data', function(chunk) {
      if (_.isArray(content)) content.push(chunk);
      else content += chunk;
    });

    //child.stdout.on('end', function(chunk) {});

    child.on('close', function(code) {
      if (_.isArray(content)) content = Buffer.concat(content);

      if (code !== 0) callback(new Error('readFile: ssh child process exited with code ' + code));
      else callback(null, content);
    });
  };

  obj.writeFile = function(args, callback) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.stdinToFile(args) ]), args);

    defaultListeners(child, args, callback);

    child.stdin.write(args.content, args.encoding);
    child.stdin.end();

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('writeFile: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.exists = function(args, callback) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.exists(args) ]), args);

    //child.stdout.setEncoding('utf8');

    defaultListeners(child, args, callback);

    child.on('close', function(code) {
      if (code !== 0) callback(null, false);
      else callback(null, true);
    });
  };

  obj.mkdir = function(args, callback) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.mkdir(args) ]), args);

    defaultListeners(child, args, callback);

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('mkdir: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.remove = function(args, callback) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.rm(args) ]), args);

    defaultListeners(child, args, callback);

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('remove: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.move = function(args, callback) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.mv(args) ]), args);

    defaultListeners(child, args, callback);

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('move: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.copy = function(args, callback) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.cp(args) ]), args);

    defaultListeners(child, args, callback);

    child.on('close', function(code) {
      if (code !== 0) callback(new Error('copy: ssh child process exited with code ' + code));
      else callback();
    });
  };

  obj.copyDirFromRemote = function(args, callback) {
    args = args || {};
    args.path = args.sourcePath;

    fs.mkdirs(args.targetPath, function(err) {
      if (err) return callback(err);

      var dirToTar = spawn('ssh', sshOptions.concat([ c.dirToTarStdout(args) ]), args);

      var writeStream = tar.extract(args.targetPath);

      defaultListeners(dirToTar, args, callback);

      dirToTar.stdout.pipe(writeStream).on('error', function(err) {
        callback(err);
      });

      dirToTar.on('close', function(code) {
        if (code !== 0) callback(new Error('copyDirFromRemote/dirToTar: ssh child process exited with code ' + code));
        else callback();
      });
    });
  };

  obj.copyDirToRemote = function(args, callback) {
    args = args || {};
    args.path = args.targetPath;

    obj.mkdir(_.clone(args), function(err) {
      if (err) return callback(err);

      var readStream = tar.pack(args.sourcePath);

      var tarToDir = spawn('ssh', sshOptions.concat([ c.stdinTarToDir(args) ]), args);

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

  obj.fileReadStream = function(args) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.fileToStdout(args) ]), args);

    defaultListeners(child, args);

    if (args.encoding) child.stdout.setEncoding(args.encoding);

    child.on('close', function(code) {
      if (code !== 0) throw new Error('fileReadStream: ssh child process exited with code ' + code);
    });

    return child.stdout;
  };

  obj.fileWriteStream = function(args) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.stdinToFile(args) ]), args);

    defaultListeners(child, args);

    child.on('close', function(code) {
      if (code !== 0) throw new Error('fileWriteStream: ssh child process exited with code ' + code);
    });

    return child.stdin;
  };

  obj.tarPackReadStream = function(args) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.dirToTarStdout(args) ]), args);

    defaultListeners(child, args);

    child.on('close', function(code) {
      if (code !== 0) throw new Error('tarPackReadStream: ssh child process exited with code ' + code);
    });

    return child.stdout;
  };

  obj.tarExtractWriteStream = function(args) {
    args = args || {};

    var child = spawn('ssh', sshOptions.concat([ c.stdinTarToDir(args) ]), args);

    defaultListeners(child, args);

    child.on('close', function(code) {
      if (code !== 0) throw new Error('tarExtractWriteStream: ssh child process exited with code ' + code);
    });

    var dirCreated = false;

    var throughStream = through2(function(chunk, encoding, callback) {
      if (dirCreated) return callback(null, chunk);

      obj.mkdir(_.clone(args), function(err) {
        if (err) return callback(err, chunk);

        dirCreated = true;

        callback(null, chunk);
      });
    });

    throughStream.pipe(child.stdin);

    return throughStream;
  };

  obj.exec = function(args, callback) {
    args = args || {};
    args.path = args.path || args.cwd;
    args.cwd = args.path;
    args.encodingStdout = args.encodingStdout || 'utf8';
    args.encodingStderr = args.encodingStderr || 'utf8';

    var stdout = [];
    var stderr = [];

    var child = spawn('ssh', sshOptions.concat([ c.cmd(args) ]));

    if (args.encodingStdout !== 'buffer') {
      stdout = '';
      child.stdout.setEncoding(args.encodingStdout);
    }

    if (args.encodingStderr !== 'buffer') {
      stderr = '';
      child.stderr.setEncoding(args.encodingStderr);
    }

    defaultListeners(child, args, callback);

    if (args.stdin) {
      child.stdin.write(args.stdin, args.encodingStdin);
      child.stdin.end();
    }

    child.stdout.on('data', function(chunk) {
      if (_.isArray(stdout)) stdout.push(chunk);
      else stdout += chunk;
    });

    child.stderr.on('data', function(chunk) {
      if (_.isArray(stderr)) stderr.push(chunk);
      else stderr += chunk;
    });

    child.on('close', function(code) {
      if (_.isArray(stdout)) stdout = Buffer.concat(stdout);
      if (_.isArray(stderr)) stderr = Buffer.concat(stderr);

      if (code !== 0) callback(new Error('exec: ssh child process exited with code ' + code), stdout, stderr);
      else callback(null, stdout, stderr);
    });
  };

  obj.terminate = function(callback) {
    var child = spawn('ssh', [ '-O', 'exit',
                               '-S', socketPath,
                               spec.ssh_user + '@' + spec.ssh_host ]);

    child.on('close', function(code) {
      log('ssh master exit trigger exited with code ' + code);

      if (fs.existsSync(socketPath)) fs.unlinkSync(socketPath);
      if (fs.existsSync(privateKeyPath)) fs.unlinkSync(privateKeyPath);

      if (callback) callback();
    });
  };

  return obj;
};
