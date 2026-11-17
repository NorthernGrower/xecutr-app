# hypertube (github.com/lcordenod/42_www_hypertube) on this server.
#
# The app is from 2019: React 16 with react-scripts 3, Express 4 and Mongoose 5,
# and node-sass 4, whose prebuilt binaries stop at Node 14. Node 14 is therefore
# the version it is built and run with here, and the toolchain it needs to
# compile that sass binding is installed first.
FROM node:14-bullseye

RUN apt-get update \
    && apt-get install -y --no-install-recommends python3 make g++ ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Dependencies first, so a code change does not reinstall them.
COPY package.json package-lock.json ./
RUN npm install --no-audit --no-fund

COPY . .

EXPOSE 5000
CMD ["node", "API/routes/server.js"]
