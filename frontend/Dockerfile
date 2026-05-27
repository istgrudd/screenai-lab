# ScreenAI Lab — Frontend container (multi-stage)
#
# Stage 1: install npm deps and run `vite build` against a build-time
#          VITE_API_BASE_URL (Vite inlines env vars at build time, not runtime).
# Stage 2: serve the resulting static bundle with nginx, which also reverse-
#          proxies /api/ to the backend container on the compose network.
#
# Build with docker-compose so VITE_API_BASE_URL flows through as a build arg.

# --- Stage 1: build the static bundle ---
FROM node:20-alpine AS builder

WORKDIR /app

# Install deps first for layer caching.
COPY package.json package-lock.json* ./
RUN if [ -f package-lock.json ]; then npm ci; else npm install; fi

# Copy the rest of the source.
COPY . .

# VITE_API_BASE_URL must be passed at build time. docker-compose.yml wires
# this through from the root .env via the `args:` block on the frontend
# service. Without it the build falls back to the dev URL in api.js, which
# breaks in production.
ARG VITE_API_BASE_URL
ENV VITE_API_BASE_URL=$VITE_API_BASE_URL

RUN npm run build


# --- Stage 2: serve with nginx ---
FROM nginx:alpine

# Replace the default nginx config with our SPA + /api proxy.
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Drop the built assets into nginx's web root.
COPY --from=builder /app/dist /usr/share/nginx/html

EXPOSE 80

# nginx:alpine ships a sensible default CMD; we inherit it.
