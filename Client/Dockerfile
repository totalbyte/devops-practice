FROM node:22-alpine AS base
# The npm bundled with node:22 (10.x) ships vulnerable pacote/sigstore/tar;
# npm 11 is supported on Node >= 22.9.
RUN apk add --no-cache curl \
    && npm install --global npm@11 --no-audit --no-fund \
    && npm cache clean --force
WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]
