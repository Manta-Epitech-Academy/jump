#!/bin/bash
# TekCamp/rollback.sh

if [ -z "$1" ]; then
  echo "❌ Error: Please provide the tag to rollback to (e.g., v20260227-2037)"
  echo "Usage: ./rollback.sh vYYYYMMDD-HHMM"
  exit 1
fi

PREVIOUS_TAG=$1
GITHUB_USER="mateo-cabrera"

echo "⏪ Rolling back to $PREVIOUS_TAG..."

# PocketBase
docker pull ghcr.io/$GITHUB_USER/tekcamp-pocketbase:$PREVIOUS_TAG
docker tag ghcr.io/$GITHUB_USER/tekcamp-pocketbase:$PREVIOUS_TAG ghcr.io/$GITHUB_USER/tekcamp-pocketbase:latest
docker push ghcr.io/$GITHUB_USER/tekcamp-pocketbase:latest

# SvelteKit
docker pull ghcr.io/$GITHUB_USER/tekcamp-sveltekit:$PREVIOUS_TAG
docker tag ghcr.io/$GITHUB_USER/tekcamp-sveltekit:$PREVIOUS_TAG ghcr.io/$GITHUB_USER/tekcamp-sveltekit:latest
docker push ghcr.io/$GITHUB_USER/tekcamp-sveltekit:latest

echo "✅ Rollback pushed to registry. Watchtower will update the server shortly."
