FROM node:24-bookworm-slim AS web
WORKDIR /app/web
RUN corepack enable
COPY web/package.json web/pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile
COPY web/ ./
RUN pnpm build

FROM golang:1.27-bookworm AS core
WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download
COPY cmd/ cmd/
COPY internal/ internal/
COPY pkg/ pkg/
RUN CGO_ENABLED=0 go build -trimpath -o /pxboard ./cmd/pxboard

FROM debian:bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates && rm -rf /var/lib/apt/lists/* && useradd -u 10001 -m pxboard && mkdir -p /app/data && chown pxboard:pxboard /app/data
WORKDIR /app
COPY --from=core /pxboard /app/pxboard
COPY --from=web /app/web/dist /app/web/dist
USER pxboard
EXPOSE 8080
VOLUME ["/app/data"]
ENTRYPOINT ["/app/pxboard"]
CMD ["-listen", "0.0.0.0:8080"]
