module.exports = {
  apps: [
    {
      name: 'veilmap',
      script: 'node_modules/.bin/next',
      args: 'start',
      cwd: '/home/veilmap/veilmap',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
    },
  ],
};
