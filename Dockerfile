#development build
FROM node:18-buster-slim as development
ARG NODE_USER_UID=1000
ARG NODE_USER_GID=1000

RUN usermod -u $NODE_USER_UID node && \
    groupmod -g $NODE_USER_GID node

WORKDIR /home/node/app
USER node

EXPOSE 3000

#production build
FROM node:18-alpine as production

WORKDIR /home/node/app

COPY ./ /home/node/app/
RUN yarn && npx tsc --build && rm -R src/
CMD ["node", "./build/index.js"]
EXPOSE 3000