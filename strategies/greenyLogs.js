const fs = require('fs');

const greenyLogs = (message) => {
  fs.appendFileSync('./greenyLogFile', message + '\r\n')
}
module.exports = greenyLogs
