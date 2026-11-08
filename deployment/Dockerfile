ARG SOLC_VER=0.8.28
FROM ethereum/solc:${SOLC_VER}-alpine AS solc

FROM node:24.22.1-alpine3.24@sha256:06d7adf3e0ef61a13f1d28682726366f97a15aa1888c934d3ecec86c33918b53

COPY --from=solc /usr/local/bin/solc /usr/local/bin/solc

COPY app /app
COPY scripts /app/scripts
WORKDIR /app

RUN apk add --no-cache python3 bash py3-pip && \
    npm ci --ignore-scripts --no-audit --no-fund && \
    ln -s /contracts /app/contracts

# Make the vendored bundling scripts executable
RUN chmod +x /app/scripts/bundle_contracts.sh

# Create an entrypoint script to run bundling and deployment sequentially
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set the entrypoint script as the default command
ENTRYPOINT [ "/app/entrypoint.sh" ]
