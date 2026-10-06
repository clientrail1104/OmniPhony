FROM node:22-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
RUN npm ci --workspace @omni/api --omit=dev --ignore-scripts
COPY apps/api/src apps/api/src
USER node
EXPOSE 8080
CMD ["node","apps/api/src/server.mjs"]
