module.exports = {
  apps: [
    {
      name: 'veilmap',
      // Use the custom server (server.ts → dist/server.js) which includes
      // both Next.js and the WebSocket upgrade handler on the same port.
      script: 'dist/server.js',
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
