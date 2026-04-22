#!/bin/bash

set -e  # Exit immediately if a command exits with a non-zero status

echo "Starting contract bundling..."
/app/scripts/bundle_contracts.sh

echo "Starting contract deployment..."
node /app/deploy.js

echo "Post deployment validation..."
node /app/postdeployment.js

if [[ "${AUTO_CREATE_COLLECTIONS,,}" == "true" || "${AUTO_CREATE_COLLECTIONS}" == "1" || "${AUTO_CREATE_COLLECTIONS,,}" == "yes" ]]; then
  echo "Automatic collection import..."
  node /app/autocreate_collections.js
fi

if [[ "${AUTO_CREATE_SETS,,}" == "true" || "${AUTO_CREATE_SETS}" == "1" || "${AUTO_CREATE_SETS,,}" == "yes" ]]; then
  echo "Automatic ERC-721 set import..."
  node /app/autocreate_sets.js
fi

#node /app/add_roles.js
