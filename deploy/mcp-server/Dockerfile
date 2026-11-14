# The assistant's shell bridge: runs commands on the host, loopback only.
# Caddy fronts it at https://xecutr.cloud/mcp with the token check in the app.
FROM node:22-slim

WORKDIR /mcp
COPY deploy/mcp-server/server.cjs .

CMD ["node", "server.cjs"]
