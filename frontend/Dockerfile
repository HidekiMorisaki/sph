FROM node:22-alpine AS development

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

ENV NODE_ENV=production
ENV TZ=Asia/Tokyo
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts
COPY --from=build /app/build ./build
EXPOSE 3000
CMD ["node", "build"]
