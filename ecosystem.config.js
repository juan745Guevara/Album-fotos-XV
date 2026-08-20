module.exports = {
  apps: [
    {
      name: 'album-fotos-api',
      cwd: './backend',
      script: 'src/app.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '300M',
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
};
