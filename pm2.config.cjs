const path = require('path');
const os = require('os');

const cpuCount = Array.isArray(os.cpus()) && os.cpus().length ? os.cpus().length : 1;
const configuredInstances = Number(process.env.PM2_INSTANCES || 1);
const instances = Number.isFinite(configuredInstances) && configuredInstances > 0
  ? Math.min(configuredInstances, cpuCount)
  : 1;

const configuredMemory = process.env.PM2_MAX_MEMORY || '768M';
const restartDelay = Number(process.env.PM2_RESTART_DELAY || 5000);
const minUptime = process.env.PM2_MIN_UPTIME || '20s';
const maxRestarts = Number(process.env.PM2_MAX_RESTARTS || 10);
const killTimeout = Number(process.env.PM2_KILL_TIMEOUT || 7000);
const listenTimeout = Number(process.env.PM2_LISTEN_TIMEOUT || 60000);
const backoffDelay = Number(process.env.PM2_BACKOFF_DELAY || 2000);

module.exports = {
  apps: [
    {
      name: process.env.PM2_APP_NAME || 'ethnos-api',
      script: path.join(__dirname, 'src/app.js'),
      cwd: __dirname,
      instances,
      exec_mode: instances > 1 ? 'cluster' : 'fork',
      watch: false,
      autorestart: true,
      max_restarts: maxRestarts,
      restart_delay: Number.isFinite(restartDelay) && restartDelay > 0 ? restartDelay : 5000,
      exp_backoff_restart_delay: Number.isFinite(backoffDelay) && backoffDelay > 0 ? backoffDelay : 2000,
      min_uptime: minUptime,
      max_memory_restart: configuredMemory,
      kill_timeout: Number.isFinite(killTimeout) && killTimeout > 0 ? killTimeout : 7000,
      listen_timeout: Number.isFinite(listenTimeout) && listenTimeout > 0 ? listenTimeout : 60000,
      node_args: process.env.PM2_NODE_ARGS || '--max-old-space-size=768',
      combine_logs: true,
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      error_file: path.join(__dirname, 'logs/pm2-error.log'),
      out_file: path.join(__dirname, 'logs/pm2-out.log'),
      pid_file: path.join(__dirname, 'runtime/pm2-ethnos.pid'),
      env: {
        NODE_ENV: process.env.NODE_ENV || 'production'
      }
    }
  ]
};
