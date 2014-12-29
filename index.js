var ssh = require('./lib/SSH');
var local = require('./lib/Local');

module.exports = {
  SSH: ssh,
  ssh: ssh,
  Local: local,
  local: local
}
