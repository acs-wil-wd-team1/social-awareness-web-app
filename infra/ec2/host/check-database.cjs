'use strict';
const path = require('node:path');
const backend = process.argv[2];
if (!backend || !backend.startsWith('/srv/causeconnect/releases/')) process.exit(1);
const { sequelize, Category } = require(path.join(backend, 'src/database/models'));
const { createRequire } = require('node:module');
const bcrypt = createRequire(path.join(backend, 'package.json'))('bcrypt');
sequelize.options.logging = false;
(async () => {
  try {
    await sequelize.authenticate();
    if (await Category.count() < 4) throw new Error('Categories missing');
    const hash = await bcrypt.hash('temporary-runtime-check', 4);
    if (!await bcrypt.compare('temporary-runtime-check', hash)) throw new Error('Password hashing unavailable');
    console.log('Database, categories and password-hashing readiness passed.');
  } catch {
    console.error('Database readiness failed; inspect the database and migration state.');
    process.exitCode = 1;
  } finally { await sequelize.close(); }
})();
