#!/bin/bash

# Stop on first error
set -e

# Configuration
GITHUB_USER="mateo-cabrera"
PROD_PB_URL="https://epitech.mateo-cabrera.com/tekcamp/pb"
INTERNAL_PB_URL="http://pocketbase:8090"

# Generate a unique tag based on the current timestamp (e.g., v20260213-1549)
TIMESTAMP="v$(date +%Y%m%d-%H%M)"

echo "🚀 Starting deployment with tag: $TIMESTAMP"

# --- POCKETBASE ---
echo "📦 Building PocketBase..."
docker buildx build \
  -t ghcr.io/$GITHUB_USER/tekcamp-pocketbase:$TIMESTAMP \
  -t ghcr.io/$GITHUB_USER/tekcamp-pocketbase:latest \
  ./pocketbase-backend

echo "⬆️  Pushing PocketBase..."
# Push both tags: one for history, one for Watchtower
docker push ghcr.io/$GITHUB_USER/tekcamp-pocketbase:$TIMESTAMP
docker push ghcr.io/$GITHUB_USER/tekcamp-pocketbase:latest

# --- SVELTEKIT ---
echo "📦 Building SvelteKit..."
docker buildx build \
  --build-arg PUBLIC_POCKETBASE_URL="$PROD_PB_URL" \
  --build-arg PUBLIC_INTERNAL_POCKETBASE_URL="$INTERNAL_PB_URL" \
  -t ghcr.io/$GITHUB_USER/tekcamp-sveltekit:$TIMESTAMP \
  -t ghcr.io/$GITHUB_USER/tekcamp-sveltekit:latest \
  ./frontend

echo "⬆️  Pushing SvelteKit..."
docker push ghcr.io/$GITHUB_USER/tekcamp-sveltekit:$TIMESTAMP
docker push ghcr.io/$GITHUB_USER/tekcamp-sveltekit:latest

echo "✅ Deployment Complete!"
echo "📝 History saved as tag: $TIMESTAMP"
echo "⏳ Watchtower will pull 'latest' in ~1 minute."
