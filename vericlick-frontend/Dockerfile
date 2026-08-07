# --- Stage 1: build the SPA ---
FROM node:22-alpine AS build
WORKDIR /build

# Vite inlines these at build time (see docker-compose.yml for values).
ARG VITE_API_BASE_URL
ARG VITE_SITE_URL
ARG VITE_GOOGLE_CLIENT_ID
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_SITE_URL=${VITE_SITE_URL} \
    VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID} \
    NODE_OPTIONS="--max-old-space-size=512"

COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# --- Stage 2: static files + HTTPS reverse proxy (Caddy) ---
FROM caddy:2-alpine
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /build/dist /usr/share/caddy
# Certificates/ACME state persist in the caddy_data volume (see compose file).
EXPOSE 80 443