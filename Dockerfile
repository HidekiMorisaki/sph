# blitz.cloud runs pre-deploy steps in the app's default image. Keep the
# frontend server and the independent migration job available in that image.
FROM node:22-alpine AS frontend-build
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --ignore-scripts
COPY frontend/ ./
RUN npm run prepare && npm run build

FROM node:22-alpine AS migration-build
WORKDIR /opt/sph-migration
COPY api/package*.json ./
RUN npm ci --ignore-scripts
COPY api/ ./
COPY VERSION release-metadata.json ./
RUN npm run prepare

FROM node:22-alpine
ENV NODE_ENV=production TZ=Asia/Tokyo
WORKDIR /app
COPY frontend/package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=frontend-build /app/build ./build
COPY --from=migration-build /opt/sph-migration /opt/sph-migration
# The platform executes pre-deploy commands in this default image. Forward
# those two npm scripts to the separate API working directory.
RUN node -e 'const fs = require("node:fs"); const file = "/app/package.json"; const pkg = JSON.parse(fs.readFileSync(file, "utf8")); pkg.scripts["db:deploy"] = "cd /opt/sph-migration && npm run db:deploy"; pkg.scripts["admin:create"] = "cd /opt/sph-migration && npm run admin:create"; fs.writeFileSync(file, JSON.stringify(pkg));'
EXPOSE 3000
CMD ["node", "build"]
