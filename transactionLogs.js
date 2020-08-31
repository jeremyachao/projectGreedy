const fs = require('fs');

const transactionLogs = (message) => {
  fs.appendFileSync('./transactionLogsFile', message + '\r\n')
}
module.exports = transactionLogs
