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
ADMIN_TOKEN=$(openssl rand -base64 32)

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

# --- Provision S3 API key ---
# Restart Garage so it picks up the new garage.toml
echo ""
echo "Starting Garage with new config..."
docker compose up -d --force-recreate garage
GARAGE_ADMIN="http://localhost:3903"
AUTH="Authorization: Bearer $ADMIN_TOKEN"

API_READY=false
echo "Waiting for Garage admin API..."
for i in $(seq 1 60); do
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" -H "$AUTH" "$GARAGE_ADMIN/v2/GetClusterStatus" 2>/dev/null || echo "000")
    if [ "$HTTP_CODE" = "200" ]; then
        API_READY=true
        break
    fi
    sleep 2
done

if [ "$API_READY" != "true" ]; then
    echo "ERROR: Garage admin API did not become ready after 120s."
    echo "Check 'docker compose logs garage' for details."
    exit 1
fi
echo "Garage admin API is ready."

# Apply cluster layout (single-node: assign all capacity to the only node)
STATUS=$(curl -s -H "$AUTH" "$GARAGE_ADMIN/v2/GetClusterStatus")
NODE_ID=$(echo "$STATUS" | python3 -c "import sys,json; print(json.load(sys.stdin)['nodes'][0]['id'])")

if [ -z "$NODE_ID" ]; then
    echo "ERROR: Could not determine node ID."
    echo "Raw response: $STATUS"
    exit 1
fi
echo "Node ID: $NODE_ID"

curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"roles\": [{\"id\": \"$NODE_ID\", \"zone\": \"dc1\", \"capacity\": 1000000000, \"tags\": [\"dev\"]}]}" \
    "$GARAGE_ADMIN/v2/UpdateClusterLayout" > /dev/null

curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"version": 1}' \
    "$GARAGE_ADMIN/v2/ApplyClusterLayout" > /dev/null

echo "Cluster layout applied."

# Create an API key for the SvelteKit app
KEY_RESPONSE=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"name": "jump-app"}' \
    "$GARAGE_ADMIN/v2/CreateKey")

S3_ACCESS_KEY_ID=$(echo "$KEY_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['accessKeyId'])")
S3_SECRET_ACCESS_KEY=$(echo "$KEY_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['secretAccessKey'])")

if [ -z "$S3_ACCESS_KEY_ID" ]; then
    echo "ERROR: Failed to create API key."
    echo "Raw response: $KEY_RESPONSE"
    exit 1
fi

# Create the "jump-files" bucket
BUCKET_RESPONSE=$(curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d '{"globalAlias": "jump-files"}' \
    "$GARAGE_ADMIN/v2/CreateBucket")

BUCKET_ID=$(echo "$BUCKET_RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin)['id'])")

if [ -z "$BUCKET_ID" ]; then
    echo "ERROR: Failed to create bucket."
    echo "Raw response: $BUCKET_RESPONSE"
    exit 1
fi

# Grant the jump-app key read+write on the bucket
curl -s -X POST -H "$AUTH" -H "Content-Type: application/json" \
    -d "{\"bucketId\": \"$BUCKET_ID\", \"accessKeyId\": \"$S3_ACCESS_KEY_ID\", \"permissions\": {\"read\": true, \"write\": true, \"owner\": true}}" \
    "$GARAGE_ADMIN/v2/AllowBucketKey" > /dev/null

echo "Bucket 'jump-files' created and linked to jump-app key."

# Write S3 credentials to .env
if [ -f .env ]; then
    sed -i '' '/^S3_ENDPOINT=/d;/^S3_REGION=/d;/^S3_ACCESS_KEY_ID=/d;/^S3_SECRET_ACCESS_KEY=/d' .env
fi
cat >> .env <<EOF
S3_ENDPOINT=http://localhost:3900
S3_REGION=garage
S3_ACCESS_KEY_ID=$S3_ACCESS_KEY_ID
S3_SECRET_ACCESS_KEY=$S3_SECRET_ACCESS_KEY
EOF

echo ""
echo "S3 credentials added to .env"
echo "  access_key_id:     $S3_ACCESS_KEY_ID"
echo "  secret_access_key: $S3_SECRET_ACCESS_KEY"
