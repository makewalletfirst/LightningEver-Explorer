/* Copy to ecosystem.config.js and fill in your own values.
 * The real ecosystem.config.js is gitignored so secrets never reach GitHub. */
module.exports = {
  apps: [
    {
      name: 'LN-Explorer',
      script: 'server.js',
      cwd: __dirname,
      max_restarts: 5,
      time: true,
      env: {
        PORT: 3009,
        HOST: '0.0.0.0',
        ECLAIR_URL: 'http://<your-eclair-host>:8085',
        ECLAIR_PASSWORD: '<your-eclair-api-password>',
        PUBLIC_URL: 'https://<your-public-domain>',
      },
    },
  ],
};
