# stage 1: build the static bundle with node
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# stage 2: serve it with nginx. only dist/ is copied over, node and
# node_modules stay behind in the build stage
FROM nginxinc/nginx-unprivileged:1.29-alpine
# pull in alpine security fixes released after the base image was built
USER root
RUN apk upgrade --no-cache
ENV BACKEND_HOST=backend
COPY nginx.conf.template /etc/nginx/templates/default.conf.template
COPY --from=build /app/dist /usr/share/nginx/html
# unprivileged image already runs as uid 101 (nginx) and listens on 8080
USER 101
EXPOSE 8080
