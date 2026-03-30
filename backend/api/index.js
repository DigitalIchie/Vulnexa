let cachedServer;

module.exports = async function handler(req, res) {
  if (!cachedServer) {
    const { getServer } = require('../dist/serverless');
    cachedServer = await getServer();
  }

  return cachedServer(req, res);
};
