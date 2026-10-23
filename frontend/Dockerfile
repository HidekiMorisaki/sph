FROM node:22-alpine AS development
RUN apk add --no-cache 'zlib>=1.3.2-r1'

ENV TZ=Asia/Tokyo
WORKDIR /app
COPY package*.json ./
RUN npm ci --ignore-scripts
COPY . .
RUN npm run prepare
CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0"]

FROM development AS build
RUN npm run build

FROM node:22-alpine AS production
RUN apk add --no-cache 'zlib>=1.3.2-r1'

ENV NODE_ENV=production
ENV TZ=Asia/Tokyo
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/build ./build
COPY --from=build /app/licenses ./licenses
COPY scripts/start-production.mjs ./scripts/start-production.mjs
COPY src/lib/service-readiness.mjs ./src/lib/service-readiness.mjs
EXPOSE 3000
CMD ["node", "scripts/start-production.mjs"]
