ARG SOLC_VER=0.8.28
FROM ethereum/solc:${SOLC_VER}-alpine AS solc

FROM alpine:3.20.3

COPY --from=solc /usr/local/bin/solc /usr/local/bin/solc

COPY app /app
COPY scripts /app/scripts
WORKDIR /app

RUN apk add --no-cache nodejs-lts npm python3 make g++ bash python3 py3-pip && \
    npm i -g npm && \
    npm install && \
    apk del npm make g++ && \
    ln -s /contracts /app/contracts

# Install OpenZeppelin Contracts and other project dependencies
RUN npm install @openzeppelin/contracts @openzeppelin/contracts-upgradeable

# Make the vendored bundling scripts executable
RUN chmod +x /app/scripts/bundle_contracts.sh

# Create an entrypoint script to run bundling and deployment sequentially
COPY entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

# Set the entrypoint script as the default command
ENTRYPOINT [ "/app/entrypoint.sh" ]
