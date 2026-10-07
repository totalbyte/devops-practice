FROM node:22-alpine AS base
RUN apk add --no-cache curl
WORKDIR /app

COPY package*.json ./
RUN npm ci \
    && npm cache clean --force \
    && rm -rf /usr/local/lib/node_modules/npm /usr/local/bin/npm /usr/local/bin/npx

COPY . .

ARG APP_VERSION=dev
ENV VITE_APP_VERSION=${APP_VERSION}

EXPOSE 3000

CMD ["node_modules/.bin/vite", "--host", "0.0.0.0", "--port", "3000"]
