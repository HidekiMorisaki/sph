FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS development
RUN apk add --no-cache 'zlib>=1.3.2-r1' \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx

ENV TZ=Asia/Tokyo
WORKDIR /app
COPY frontend/package*.json frontend/.npmrc ./
COPY LICENSE /LICENSE
COPY vendor/npm/ /vendor/npm/
RUN node /vendor/npm/prepare.mjs
RUN node /vendor/npm/install.mjs
COPY frontend/ .
RUN node /vendor/npm/run.mjs prepare
CMD ["node", "node_modules/vite/bin/vite.js", "dev", "--host", "0.0.0.0"]

FROM development AS build
RUN node /vendor/npm/run.mjs build

FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS production
RUN apk add --no-cache 'zlib>=1.3.2-r1' \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx

ENV NODE_ENV=production
ENV TZ=Asia/Tokyo
WORKDIR /app
COPY frontend/package*.json frontend/.npmrc ./
COPY LICENSE /LICENSE
COPY vendor/npm/ /vendor/npm/
RUN node /vendor/npm/prepare.mjs
RUN node /vendor/npm/install.mjs --omit=dev
# Runtime starts Node directly; package managers and their unused dependency trees
# belong only to the build toolchain.
RUN rm -rf /vendor /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
COPY --from=build /app/build ./build
COPY --from=build /app/licenses ./licenses
COPY frontend/scripts/start-production.mjs ./scripts/start-production.mjs
COPY frontend/src/lib/service-readiness.mjs ./src/lib/service-readiness.mjs
EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
