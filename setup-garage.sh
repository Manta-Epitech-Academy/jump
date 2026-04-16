#!/usr/bin/env bash
set -euo pipefail

# Check if openssl and htpasswd are installed
if ! command -v openssl &> /dev/null; then
    echo "openssl is required but not installed. Please install openssl and try again."
    exit 1
fi
if ! command -v htpasswd &> /dev/null; then
    echo "htpasswd is required but not installed. Please install htpasswd (part of Apache HTTP Server) and try again."
    exit 1
fi

RPC_SECRET=$(openssl rand -hex 32)
ADMIN_TOKEN=$(openssl rand -hex 32)

mkdir -p garage/

# If garage.toml is a folder, remove it
if [ -d garage/garage.toml ]; then
    rm -rf garage/garage.toml
fi

cat <<EOT > garage/garage.toml
metadata_dir = "/var/lib/garage/meta"
data_dir     = "/var/lib/garage/data"
db_engine    = "sqlite"
replication_factor = 1

rpc_bind_addr   = "[::]:3901"
rpc_public_addr = "garage:3901"
rpc_secret      = "$RPC_SECRET"

[s3_api]
s3_region    = "garage"
api_bind_addr = "[::]:3900"

[admin]
api_bind_addr = "[::]:3903"
admin_token   = "$ADMIN_TOKEN"
EOT


echo "garage/garage.toml created"
echo "  rpc_secret:  $RPC_SECRET"
echo "  admin_token: $ADMIN_TOKEN"
