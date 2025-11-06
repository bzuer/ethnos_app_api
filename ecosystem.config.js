module.exports = {
  apps: [{
    name: 'ethnos-api',
    script: 'src/app.js',
    instances: 1,
    exec_mode: 'fork',
    
    // Environment
    env: {
      NODE_ENV: 'development',
      PORT: 1210,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3000,
      REDIS_MANDATORY_IN_PRODUCTION: 'true'
    },
    
    // Restart policy otimizada para out of memory prevention
    restart_delay: 5000,
    max_restarts: 10,
    min_uptime: '10s',
    
    // Auto restart on crashes
    autorestart: true,
    watch: false,
    max_memory_restart: '512M',
    
    // Logs
    log_file: 'logs/pm2-combined.log',
    error_file: 'logs/pm2-error.log',
    out_file: 'logs/pm2-output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    
    // Process management
    kill_timeout: 5000,
    listen_timeout: 10000,
    shutdown_with_message: true,
    
    // Health monitoring
    health_check_grace_period: 30000,
    health_check_fatal_exceptions: true,
    
    // Node.js otimizations para hardware limitado
    node_args: [
      '--max-old-space-size=1000', // Limite heap 512MB (reduzido de 2GB)
      '--optimize-for-size',      // Otimizar para menor uso de memória
      '--gc-interval=100'         // Garbage collection mais frequente
    ],
    source_map_support: false,
    
    // Ignore watch
    ignore_watch: [
      'node_modules',
      'logs',
      'uploads',
      '*.log',
      '*.pid'
    ],
    
    // Advanced features
    instance_var: 'INSTANCE_ID',
    increment_var: 'PORT',
    
    // Graceful shutdown
    wait_ready: true,
    shutdown_with_message: true,
  }]
};
