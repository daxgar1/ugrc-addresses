FROM node:24-trixie
WORKDIR /usr/local/ugrc-addresses

# Install required packages
RUN DEBIAN_FRONTEND=noninteractive apt-get update && \
    apt-get install -y --no-install-recommends osmium-tool curl tippecanoe && \
    rm -rf /var/lib/apt/lists/*

# Install the application dependencies
COPY package*.json ./
RUN npm ci --omit=dev

# Copy in the source code
COPY src ./src
COPY server.js ./
COPY map.html ./

# Run as the node user intead of the root user
RUN chown -R node:node /usr/local/ugrc-addresses
USER node

CMD ["node", "server.js"]
