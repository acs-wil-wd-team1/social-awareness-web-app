'use strict';
const app = require('/srv/causeconnect/current/backend/src/app');
// Nginx is the only listener reachable by the public and replaces forwarding headers.
app.set('trust proxy', 1);
const server = app.listen(3000, '127.0.0.1', () => console.log('CauseConnect API listening on loopback.'));
const close = () => {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(1), 15000).unref();
};
process.once('SIGTERM', close);
process.once('SIGINT', close);
