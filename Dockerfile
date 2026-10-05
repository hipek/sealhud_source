# syntax=docker/dockerfile:1

# --- Build stage: compile the HUD into static files (dist/) ---
FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund

COPY tsconfig.json webpack.config.js ./
COPY src ./src

ARG SENTRY_DSN=""
ARG RELEASE=""
ENV SENTRY_DSN=$SENTRY_DSN \
    RELEASE=$RELEASE

RUN npm run build && find dist -name '*.map' -delete

# --- Runtime stage: tiny static file server ---
FROM busybox:1.37-musl

COPY httpd.conf /etc/httpd.conf
COPY --from=build /app/dist /www

USER 65534:65534
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:8080/ || exit 1

CMD ["httpd", "-f", "-v", "-p", "8080", "-h", "/www", "-c", "/etc/httpd.conf"]
