FROM node:22-alpine AS development

ENV TZ=Asia/Tokyo
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --ignore-scripts
COPY api/ .
COPY VERSION release-metadata.json ./
RUN npm run prepare
CMD ["sh", "-c", "npm run prepare && npm run dev -- --host 0.0.0.0"]

FROM development AS build
RUN npm run build

FROM node:22-alpine AS production

ENV NODE_ENV=production
ENV TZ=Asia/Tokyo
WORKDIR /app
COPY api/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/build ./build
COPY --from=build /app/src/lib/server/generated ./src/lib/server/generated
COPY --from=build /app/VERSION ./VERSION
COPY --from=build /app/release-metadata.json ./release-metadata.json
EXPOSE 3000
CMD ["node", "build"]
