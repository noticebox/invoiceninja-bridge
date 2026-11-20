# Build: full deps, tsc to dist/, then only the production deps. Debian like the runtime image, so the build sees the same libc.
FROM node:26-trixie-slim AS build
WORKDIR /app
COPY package.json package-lock.json .npmrc ./
# No install scripts: better-sqlite3's prebuilt binaries are in the package and are what it loads.
RUN npm ci --ignore-scripts
COPY tsconfig.json tsconfig.build.json ./
COPY src ./src
RUN npm run build && npm prune --omit=dev && mkdir /data /config

# Runtime: Node and the libraries it links against, no shell or package manager.
FROM gcr.io/distroless/nodejs26-debian13
WORKDIR /app
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data BRIDGE_MAPPINGS=/config/mappings.json
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=build /app/package.json ./
COPY --from=build --chown=1000:1000 /data /data
COPY docker-entrypoint.mjs ./
VOLUME /data
EXPOSE 8080
# GET /health: 503 when the database doesn't answer. Node, not wget: the image has no shell.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD ["/nodejs/bin/node", "-e", "fetch(`http://127.0.0.1:${process.env.PORT}/health`).then((r) => process.exit(r.ok ? 0 : 1), () => process.exit(1))"]
# --use-system-ca: noticebox, Invoice Ninja and ntfy are trusted through the image's certificate store; an extra CA comes in with
# NODE_EXTRA_CA_CERTS pointing to a mounted file.
ENTRYPOINT ["/nodejs/bin/node", "--use-system-ca", "docker-entrypoint.mjs"]
