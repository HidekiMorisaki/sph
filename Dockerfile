# blitz.cloud runs pre-deploy steps in the app's default image. Keep the
# frontend server and the independent migration job available in that image.
FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS frontend-build
RUN apk add --no-cache 'zlib>=1.3.2-r1' \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
WORKDIR /app
COPY frontend/package*.json frontend/.npmrc ./
COPY LICENSE /LICENSE
COPY vendor/npm/ /vendor/npm/
RUN node /vendor/npm/prepare.mjs
RUN node /vendor/npm/install.mjs
COPY frontend/ ./
RUN node /vendor/npm/run.mjs prepare && node /vendor/npm/run.mjs build

FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS migration-build
RUN apk add --no-cache 'zlib>=1.3.2-r1' \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
WORKDIR /opt/sph-migration
COPY api/package*.json api/.npmrc ./
COPY LICENSE /LICENSE
COPY vendor/npm/ /vendor/npm/
RUN node /vendor/npm/prepare.mjs && mkdir -p /opt/vendor && cp -a /vendor/npm /opt/vendor/npm
RUN node /vendor/npm/install.mjs
COPY api/ ./
COPY VERSION release-metadata.json ./
RUN node /vendor/npm/run.mjs prepare

FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914
RUN apk add --no-cache 'zlib>=1.3.2-r1' \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
ENV NODE_ENV=production TZ=Asia/Tokyo
WORKDIR /app
COPY frontend/package*.json frontend/.npmrc ./
COPY LICENSE /LICENSE
COPY vendor/npm/ /vendor/npm/
RUN node /vendor/npm/prepare.mjs
RUN node /vendor/npm/install.mjs --omit=dev
COPY --from=frontend-build /app/build ./build
COPY --from=frontend-build /app/licenses ./licenses
COPY frontend/scripts/start-production.mjs ./scripts/start-production.mjs
COPY frontend/src/lib/service-readiness.mjs ./src/lib/service-readiness.mjs
COPY --from=migration-build /opt/sph-migration /opt/sph-migration
# Pre-deploy uses the independent Node migration entry point, without npm.
RUN rm -rf /vendor /opt/vendor /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
