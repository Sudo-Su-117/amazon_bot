const fs = require('fs');
const path = require('path');
const logFilePath = path.join(__dirname, '../app.log');

// Core logging utility that logs to both console and a local app.log file
function writeLog(level, category, message, error = null) {
  const timestamp = new Date().toISOString();
  let logLine = `[${timestamp}] [${level}] [${category}] ${message}`;
  if (error) {
    logLine += ` | Error: ${error.stack || error.message || error}`;
  }
  logLine += '\n';

  // Format terminal output with nice icons
  const icon = level === 'ERROR' ? '❌ ' : level === 'WARN' ? '⚠️ ' : '✅ ';
  if (level === 'ERROR') {
    console.error(icon + logLine.trim());
  } else if (level === 'WARN') {
    console.warn(icon + logLine.trim());
  } else {
    console.log(icon + logLine.trim());
  }

  // Atomically append to log file
  try {
    fs.appendFileSync(logFilePath, logLine, 'utf8');
  } catch (err) {
    console.error('❌ Failed to write to log file:', err.message);
  }
}

module.exports = {
  info: (category, message) => writeLog('INFO', category, message),
  warn: (category, message) => writeLog('WARN', category, message),
  error: (category, message, err) => writeLog('ERROR', category, message, err)
};
