FROM node:22-alpine AS build
WORKDIR /app
RUN apk add --no-cache python3 make g++

COPY package.json package-lock.json* ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/types/package.json packages/types/
COPY packages/shared/package.json packages/shared/

RUN npm install --workspaces --include-workspace-root

COPY . .
RUN npm run build --workspace=apps/web

FROM node:22-alpine
WORKDIR /app

ENV NODE_ENV=production
ENV DATA_DIR=/app/data
ENV PORT=4100

COPY --from=build /app /app
COPY data/config.example.json /app/data/config.example.json
COPY docker-entrypoint.sh /entrypoint.sh
RUN chmod +x /entrypoint.sh

EXPOSE 4100
ENTRYPOINT ["/entrypoint.sh"]
