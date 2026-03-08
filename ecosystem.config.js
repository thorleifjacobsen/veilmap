module.exports = {
  apps: [
    {
      name: 'veilmap',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/home/veilmap/app',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      max_memory_restart: '1024M',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      error_file: '/home/veilmap/logs/error.log',
      out_file: '/home/veilmap/logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
    },
  ],
};
