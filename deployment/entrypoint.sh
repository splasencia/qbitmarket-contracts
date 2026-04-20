#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

echo "Starting contract bundling..."
/app/scripts/bundle_contracts.sh

echo "Starting contract deployment..."
node /app/deploy.js
