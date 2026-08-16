# syntax=docker/dockerfile:1

FROM node:22-alpine AS dependencies
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci

FROM node:22-alpine AS builder
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY --from=dependencies /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM node:22-alpine AS runner
WORKDIR /app

COPY --from=public.ecr.aws/awsguru/aws-lambda-adapter:1.0.1 \
  /lambda-adapter /opt/extensions/lambda-adapter

ENV NODE_ENV=production \
    NEXT_TELEMETRY_DISABLED=1 \
    PORT=3000 \
    HOSTNAME=0.0.0.0 \
    AWS_LWA_PORT=3000 \
    AWS_LWA_READINESS_CHECK_PATH=/ \
    AWS_LWA_ENABLE_COMPRESSION=true

COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static
COPY run.sh ./run.sh
RUN chmod 755 ./run.sh

EXPOSE 3000
CMD ["./run.sh"]
