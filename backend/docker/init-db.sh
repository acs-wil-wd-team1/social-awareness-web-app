#!/bin/bash
# Runs once, on first container boot only (docker-entrypoint-initdb.d is
# skipped whenever the mysql_data volume already has data in it).
#
# MYSQL_ROOT_PASSWORD, DB_NAME, DB_NAME_TEST, DB_USER and DB_PASSWORD are
# provided by the `environment:` block in docker-compose.yml.
set -euo pipefail

mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" <<-SQL
    CREATE DATABASE IF NOT EXISTS \`${DB_NAME}\`;
    CREATE DATABASE IF NOT EXISTS \`${DB_NAME_TEST}\`;
    CREATE USER IF NOT EXISTS '${DB_USER}'@'%' IDENTIFIED BY '${DB_PASSWORD}';
    GRANT ALL PRIVILEGES ON \`${DB_NAME}\`.* TO '${DB_USER}'@'%';
    GRANT ALL PRIVILEGES ON \`${DB_NAME_TEST}\`.* TO '${DB_USER}'@'%';
    FLUSH PRIVILEGES;
SQL
