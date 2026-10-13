'use strict';
const { createRequire } = require('node:module');
const requireApp = createRequire('/srv/causeconnect/current/backend/package.json');
const mysql = requireApp('mysql2/promise');
const bcrypt = requireApp('bcrypt');
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', chunk => {
  input += chunk;
  if (input.length > 4096) process.exit(1);
});
process.stdin.on('end', async () => {
  let connection;
  try {
    const [name, rawEmail, password, end] = input.split('\0');
    const email = rawEmail?.trim().toLowerCase();
    if (!name?.trim() || name.trim().length > 100 || !email || email.length > 150 ||
        !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !password || password.length < 16 ||
        Buffer.byteLength(password) > 72 || end !== '') throw new Error('Invalid input');
    connection = await mysql.createConnection({
      host: process.env.DB_HOST, port: Number(process.env.DB_PORT), database: process.env.DB_NAME,
      user: process.env.DB_USER, password: process.env.DB_PASSWORD,
    });
    const [[lock]] = await connection.execute("SELECT GET_LOCK('causeconnect-bootstrap-admin', 10) AS acquired");
    if (lock.acquired !== 1) throw new Error('Admin bootstrap is already running');
    const [admins] = await connection.execute("SELECT user_id FROM users WHERE role = 'admin' LIMIT 1");
    if (admins.length) throw new Error('An admin already exists');
    const hash = await bcrypt.hash(password, 12);
    await connection.execute(
      "INSERT INTO users (full_name,email,password_hash,role,status,created_at,updated_at) VALUES (?,?,?,'admin','active',UTC_TIMESTAMP(),UTC_TIMESTAMP())",
      [name.trim(), email, hash],
    );
    console.log('One dedicated admin account was created. Existing accounts were not promoted or reset.');
  } catch {
    console.error('Admin creation failed. Check input, existing admin/email, and database connectivity. No password was printed.');
    process.exitCode = 1;
  } finally {
    input = '';
    if (connection) await connection.end();
  }
});
