#!/usr/bin/env bash

set -euo pipefail

usage() {
  cat <<'HELP'
Usage: scripts/create-user.sh <email> [api_key]

Creates a new user record in the database with the provided email and API key.
If the API key argument is omitted, a secure key will be generated automatically.

Environment:
  DATABASE_URL  Postgres connection string (required)

Example:
  DATABASE_URL=postgres://... ./scripts/create-user.sh alice@example.com
HELP
}

if [[ $# -lt 1 || $# -gt 2 ]]; then
  usage
  exit 1
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "❌ DATABASE_URL environment variable is not set" >&2
  exit 1
fi

EMAIL="$1"
API_KEY="${2:-}"

if [[ -z "$API_KEY" ]]; then
  RANDOM_PART="$(openssl rand -hex 32)"
  TIMESTAMP="$(date +%s | awk '{printf("%x", $0)}')"
  API_KEY="moviemcp_${TIMESTAMP}_${RANDOM_PART}"
fi

echo "📨 Creating user for email: $EMAIL"

psql "$DATABASE_URL" \
  --set=ON_ERROR_STOP=1 \
  --set=email="$EMAIL" \
  --set=api_key="$API_KEY" \
  --tuples-only --no-align <<'SQL'
INSERT INTO users (email, api_key)
VALUES (:'email', :'api_key')
ON CONFLICT (email) DO UPDATE SET api_key = EXCLUDED.api_key
RETURNING id, email, api_key;
SQL


echo "\n🔑 API key: $API_KEY"
echo "✅ User created or updated successfully. Share this key securely with the user."

cat <<CONFIG

📦 Claude Desktop configuration snippet:

{
  "mcpServers": {
    "movies": {
      "command": "npx",
      "args": [
        "mcp-remote",
        "https://movie-mcp-server.onrender.com/mcp/sse",
        "--header",
        "Authorization: Bearer $API_KEY"
      ]
    }
  }
}

CONFIG

