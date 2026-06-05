module.exports = {
  apps: [{
    name: 'ecommerce-image-gen',
    cwd: './backend',
    script: 'server.js',
    env: {
      NODE_ENV: 'production',
      BACKEND_PORT: 3001
    },
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '500M',
    error_file: './logs/error.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log',
    time: true
  }]
}
