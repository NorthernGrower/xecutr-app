# hypertube (github.com/lcordenod/42_www_hypertube) on this server.
#
# The app is from 2019: React 16 with react-scripts 3, Express 4 and Mongoose 5,
# and node-sass 4, whose prebuilt binaries stop at Node 14. Node 14 is therefore
# the version it is built and run with here. node-sass ships a prebuilt binding
# for that version, so no compiler toolchain is needed (and the Debian archive
# those images point at no longer serves every package).
FROM node:14-bullseye-slim

WORKDIR /app

# The repository's package-lock.json carries git conflict markers, which npm
# cannot resolve, so dependencies are installed fresh from package.json.
COPY package.json ./
RUN npm install --no-audit --no-fund --package-lock=false

COPY . .

EXPOSE 5000
CMD ["node", "API/routes/server.js"]
