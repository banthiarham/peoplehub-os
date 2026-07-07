FROM node:20-alpine AS runtime

WORKDIR /app

RUN apk add --no-cache openssl

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/api/tsconfig.json apps/api/tsconfig.json
COPY apps/api/nest-cli.json apps/api/nest-cli.json
COPY apps/api/src apps/api/src
COPY packages/database/package.json packages/database/package.json
COPY packages/database/prisma packages/database/prisma
COPY packages/database/src packages/database/src
COPY packages/types/package.json packages/types/package.json
COPY packages/types/src packages/types/src
COPY packages/ui/package.json packages/ui/package.json

RUN npm ci
RUN npm run db:generate --workspace packages/database
RUN npm run build --workspace apps/api

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=3001

EXPOSE 3001

CMD ["sh", "-c", "npm run db:migrate:deploy --workspace packages/database && npm run start --workspace apps/api"]
