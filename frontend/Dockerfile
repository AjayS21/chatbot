FROM node:20-bookworm-slim AS build

WORKDIR /app

# Install workspace deps (cache-friendly)
COPY package.json package-lock.json ./
COPY backend/package.json backend/package.json
COPY frontend/package.json frontend/package.json
RUN npm ci

# Build frontend
COPY frontend/ frontend/
RUN npm run build -w frontend

FROM node:20-bookworm-slim AS runtime

ENV NODE_ENV=production
WORKDIR /app

COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/package.json ./package.json
COPY --from=build /app/frontend/package.json ./frontend/package.json
COPY --from=build /app/frontend/build ./frontend/build

EXPOSE 3000

# SvelteKit adapter-node output can be started via `node build` from the app directory.
CMD ["sh", "-lc", "cd frontend && HOST=0.0.0.0 node build"]


