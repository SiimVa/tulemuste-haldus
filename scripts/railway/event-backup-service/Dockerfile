FROM postgres:18-alpine
RUN apk add --no-cache nodejs aws-cli su-exec
WORKDIR /backup
COPY event-backups.mjs /backup/event-backups.mjs
ENTRYPOINT ["node", "/backup/event-backups.mjs"]
