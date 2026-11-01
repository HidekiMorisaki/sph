FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS development
RUN apk add --no-cache 'zlib>=1.3.2-r1' \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx

ENV TZ=Asia/Tokyo
WORKDIR /app
COPY api/package*.json api/.npmrc ./
COPY LICENSE /LICENSE
COPY vendor/npm/ /vendor/npm/
RUN node /vendor/npm/prepare.mjs
RUN node /vendor/npm/install.mjs
COPY api/ .
COPY VERSION release-metadata.json ./
COPY docs/licenses/pngjs-7.0.0-LICENSE docs/licenses/jpeg-js-0.4.4-LICENSE docs/licenses/jpeg-js-0.4.4-README.md docs/licenses/Apache-2.0-LICENSE ./licenses/
RUN node /vendor/npm/run.mjs prepare
CMD ["sh", "-c", "node /vendor/npm/run.mjs prepare && node node_modules/vite/bin/vite.js dev --port 5174 --host 0.0.0.0"]

FROM development AS build
RUN node /vendor/npm/run.mjs build

FROM development AS migration
RUN rm -rf /vendor /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
CMD ["node", "scripts/migrate-and-initialize.mjs"]

FROM node:22.23.4-alpine3.24@sha256:fe4f6d74e20370acb04ad889077d14d0f64a9c8ea6a42bc60cddf1e844699914 AS production
RUN apk add --no-cache 'zlib>=1.3.2-r1' \
 && rm -rf /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx

ENV NODE_ENV=production
ENV BODY_SIZE_LIMIT=12M
ENV TZ=Asia/Tokyo
WORKDIR /app
COPY api/package*.json api/.npmrc ./
COPY LICENSE /LICENSE
COPY vendor/npm/ /vendor/npm/
RUN node /vendor/npm/prepare.mjs
RUN node /vendor/npm/install.mjs --omit=dev --omit=optional \
 && node -e 'const fs=require("node:fs"); for(const p of ["prisma","@prisma/dev"]) if(fs.existsSync("node_modules/"+p)) throw Error("Migration toolchain must not be installed in the API runtime: "+p)'
# Runtime starts Node directly; package managers and their unused dependency trees
# belong only to the build toolchain.
RUN rm -rf /vendor /usr/local/lib/node_modules/npm /usr/local/lib/node_modules/corepack /opt/yarn-* \
 && rm -f /usr/local/bin/npm /usr/local/bin/npx /usr/local/bin/corepack /usr/local/bin/yarn /usr/local/bin/yarnpkg /usr/local/bin/pnpm /usr/local/bin/pnpx
COPY --from=build /app/build ./build
COPY --from=build /app/src/lib/server/generated ./src/lib/server/generated
COPY --from=build /app/VERSION ./VERSION
COPY --from=build /app/release-metadata.json ./release-metadata.json
COPY --from=build /app/licenses ./licenses
COPY docs/licenses/pngjs-7.0.0-LICENSE ./licenses/
COPY docs/licenses/jpeg-js-0.4.4-LICENSE docs/licenses/jpeg-js-0.4.4-README.md docs/licenses/Apache-2.0-LICENSE ./licenses/
EXPOSE 3000
CMD ["node", "build"]
