FROM node:20-alpine AS runtime

WORKDIR /app

ARG NEXT_PUBLIC_API_URL=/api/v1
ARG NEXT_PUBLIC_APP_URL=http://localhost:3000
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL
ENV NEXT_PUBLIC_APP_URL=$NEXT_PUBLIC_APP_URL

COPY package.json package-lock.json turbo.json tsconfig.base.json ./
COPY apps/web/package.json apps/web/package.json
COPY apps/web/tsconfig.json apps/web/tsconfig.json
COPY apps/web/next.config.js apps/web/next.config.js
COPY apps/web/postcss.config.js apps/web/postcss.config.js
COPY apps/web/tailwind.config.ts apps/web/tailwind.config.ts
COPY apps/web/public apps/web/public
COPY apps/web/src apps/web/src
COPY packages/types/package.json packages/types/package.json
COPY packages/types/src packages/types/src
COPY packages/ui/package.json packages/ui/package.json
COPY packages/ui/src packages/ui/src

RUN npm ci
RUN npm run build --workspace apps/web

ENV NODE_ENV=production
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

EXPOSE 3000

CMD ["npm", "run", "start", "--workspace", "apps/web"]
