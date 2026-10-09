#!/bin/sh
# Dentro do compose o banco é o host "db", não localhost.
set -e
if [ -n "$DB_HOST" ]; then
  export DATABASE_URL="postgresql://${POSTGRES_USER}:${POSTGRES_PASSWORD}@${DB_HOST}:5432/${POSTGRES_DB}"
fi
exec "$@"
