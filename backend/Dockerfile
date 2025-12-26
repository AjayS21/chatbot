FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install workspace deps (cache-friendly)
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

# Build backend
COPY backend/ backend/
RUN npm run prisma:generate -w backend
RUN npm run build -w backend

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

# Keep deps from build stage (includes prisma CLI; used for migrate on startup)
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/backend/package.json ./backend/package.json

COPY --from=build /app/backend/dist ./backend/dist
COPY --from=build /app/backend/prisma ./backend/prisma

COPY backend/docker-entrypoint.sh ./backend/docker-entrypoint.sh
RUN chmod +x ./backend/docker-entrypoint.sh

EXPOSE 3001

CMD ["./backend/docker-entrypoint.sh"]


