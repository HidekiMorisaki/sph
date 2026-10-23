FROM node:22-alpine AS development
RUN apk add --no-cache 'zlib>=1.3.2-r1'

ENV TZ=Asia/Tokyo
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --ignore-scripts
COPY api/ .
COPY VERSION release-metadata.json ./
COPY docs/licenses/pngjs-7.0.0-LICENSE docs/licenses/jpeg-js-0.4.4-LICENSE docs/licenses/jpeg-js-0.4.4-README.md docs/licenses/Apache-2.0-LICENSE ./licenses/
RUN npm run prepare
CMD ["sh", "-c", "npm run prepare && npm run dev -- --host 0.0.0.0"]

FROM development AS build
RUN npm run build

FROM node:22-alpine AS production
RUN apk add --no-cache 'zlib>=1.3.2-r1'

ENV NODE_ENV=production
ENV BODY_SIZE_LIMIT=2M
ENV TZ=Asia/Tokyo
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/build ./build
COPY --from=build /app/src/lib/server/generated ./src/lib/server/generated
COPY --from=build /app/VERSION ./VERSION
COPY --from=build /app/release-metadata.json ./release-metadata.json
COPY --from=build /app/licenses ./licenses
COPY docs/licenses/pngjs-7.0.0-LICENSE ./licenses/
COPY docs/licenses/jpeg-js-0.4.4-LICENSE docs/licenses/jpeg-js-0.4.4-README.md docs/licenses/Apache-2.0-LICENSE ./licenses/
EXPOSE 3000
CMD ["node", "build"]
