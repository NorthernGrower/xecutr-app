# The Xecutr model gateway: one Node file, talking to Ollama on the host.
# Built from this repo — there is no second (private) repo any more.
FROM node:22-slim

WORKDIR /gw
COPY deploy/gateway/server.cjs .

ENV PORT=8080
EXPOSE 8080
CMD ["node", "server.cjs"]
