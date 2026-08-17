# --- Stage 1: build the SPA ---
FROM node:22-alpine AS build
WORKDIR /build

# Vite inlines these at build time (see docker-compose.yml for values).
ARG VITE_API_BASE_URL
ARG VITE_SITE_URL
ARG VITE_GOOGLE_CLIENT_ID
ARG VITE_GOOGLE_SITE_VERIFICATION
ARG VITE_BING_VERIFICATION
ENV VITE_API_BASE_URL=${VITE_API_BASE_URL} \
    VITE_SITE_URL=${VITE_SITE_URL} \
    VITE_GOOGLE_CLIENT_ID=${VITE_GOOGLE_CLIENT_ID} \
    VITE_GOOGLE_SITE_VERIFICATION=${VITE_GOOGLE_SITE_VERIFICATION} \
    VITE_BING_VERIFICATION=${VITE_BING_VERIFICATION} \
    NODE_OPTIONS="--max-old-space-size=512"

COPY .npmrc package.json package-lock.json ./
RUN npm install
COPY . .
RUN npm run build

# --- Stage 2: custom Caddy with JA4 TLS fingerprinting plugin ---
FROM caddy:2-alpine AS caddy-build
RUN apk add --no-cache go git
ENV GOPATH=/go
ENV PATH=$PATH:/go/bin
RUN go install github.com/caddyserver/xcaddy/cmd/xcaddy@latest
RUN xcaddy build --with github.com/josuebrunel/caddy-ja3ja4

# --- Stage 3: final image ---
FROM alpine:3.19
RUN apk add --no-cache ca-certificates tzdata
COPY --from=caddy-build /go/bin/caddy /usr/bin/caddy
COPY Caddyfile /etc/caddy/Caddyfile
COPY --from=build /build/dist /usr/share/caddy
# Certificates/ACME state persist in the caddy_data volume (see compose file).
EXPOSE 80 443
CMD ["caddy", "run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
