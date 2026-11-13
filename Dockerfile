# Server app image for FreeMilk: builds the TanStack Start app and serves it
# on $PORT (default 8080), with deploy/serve.cjs in front doing what it does on
# the VPS — the built app answers everything, and Base44's own platform
# prefixes (/api/functions/, /api/entities/, …) are forwarded to base44.app.
FROM node:22-slim

WORKDIR /app

# Install dependencies first so Docker's layer cache skips it when only
# sources change. .npmrc brings the supply-chain cooldown policy along.
COPY package.json package-lock.json .npmrc ./
RUN npm ci --no-audit --no-fund

COPY . .
RUN npm run build

# Two processes, as on the VPS: the built app on loopback 8082, the public
# proxy on $PORT. If either dies the container restarts, so just relay the
# exit: when node exits, stop the preview server too.
CMD ["sh", "-c", "npm run preview -- --port 8082 --host 127.0.0.1 & exec node deploy/serve.cjs"]
