#!/usr/bin/env bash
set -euo pipefail
[[ $EUID -eq 0 ]] || { echo 'Run as root.' >&2; exit 1; }
umask 077
exec 9>/run/lock/causeconnect-database.lock
flock -n 9 || { echo 'Another database initialization is running.' >&2; exit 1; }
if [[ -f /etc/causeconnect/app.env && -f /etc/causeconnect/migrations.env ]]; then
  echo 'Existing database credentials retained.'
  exit 0
fi
if [[ -e /etc/causeconnect/app.env || -e /etc/causeconnect/migrations.env ]]; then
  echo 'Partial credential state: inspect before continuing; no credentials were replaced.' >&2
  exit 1
fi
existing=$(mysql --batch --skip-column-names -e "SELECT COUNT(*) FROM information_schema.SCHEMATA WHERE SCHEMA_NAME='causeconnect'")
[[ "$existing" == 0 ]] || { echo 'A causeconnect database already exists. Refusing to initialize over it.' >&2; exit 1; }
app_password=$(openssl rand -hex 32)
migration_password=$(openssl rand -hex 32)
jwt_secret=$(openssl rand -hex 64)
# Hex-only generated values cannot inject SQL or environment-file syntax.
mysql <<SQL
CREATE DATABASE causeconnect CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci;
CREATE USER 'causeconnect_app'@'127.0.0.1' IDENTIFIED BY '$app_password';
CREATE USER 'causeconnect_migrate'@'127.0.0.1' IDENTIFIED BY '$migration_password';
GRANT SELECT, INSERT, UPDATE, DELETE ON causeconnect.* TO 'causeconnect_app'@'127.0.0.1';
GRANT ALL PRIVILEGES ON causeconnect.* TO 'causeconnect_migrate'@'127.0.0.1';
SQL
printf 'NODE_ENV=production\nPORT=3000\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=causeconnect\nDB_USER=causeconnect_app\nDB_PASSWORD=%s\nJWT_SECRET=%s\n' \
  "$app_password" "$jwt_secret" > /etc/causeconnect/app.env
printf 'NODE_ENV=production\nDB_HOST=127.0.0.1\nDB_PORT=3306\nDB_NAME=causeconnect\nDB_USER=causeconnect_migrate\nDB_PASSWORD=%s\n' \
  "$migration_password" > /etc/causeconnect/migrations.env
unset app_password migration_password jwt_secret
echo 'Private database and separate application/migration credentials created. No user accounts were seeded.'
