FROM golang:1.26.10-alpine@sha256:27f2d3b83cfc5803c8078f8e730af0f7c431bf067afaec8f60a36fb763187cba AS build
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
WORKDIR /src
COPY gateway/go.mod gateway/go.sum ./
RUN go mod download && go mod verify
COPY gateway/patches/ /patches/
RUN echo "79f510a4b97fa2e34ec37932cab57e64dfdc9fa6c314654d1ccc2dd93898a532  /go/pkg/mod/github.com/go-jose/go-jose/v3@v3.0.5/jwk.go" | sha256sum -c - \
 && echo "17a4685ada12642629b574e970b23d8b960fe8fff1802da9c551568a97e02ebe  /patches/go-jose-v3-jwk.go" | sha256sum -c - \
 && chmod u+w /go/pkg/mod/github.com/go-jose/go-jose/v3@v3.0.5/jwk.go \
 && cp /patches/go-jose-v3-jwk.go /go/pkg/mod/github.com/go-jose/go-jose/v3@v3.0.5/jwk.go
COPY gateway/main.go ./
RUN go build -mod=readonly -trimpath -tags nobadger,nomysql,nopgx -ldflags '-w -s' -o /out/caddy .

FROM alpine:3.24.3@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a AS certificates
RUN apk add --no-cache ca-certificates-bundle=20261020-r0

FROM scratch
COPY --from=build /out/caddy /usr/bin/caddy
COPY --from=certificates /etc/ssl/certs/ca-certificates.crt /etc/ssl/certs/ca-certificates.crt
COPY licenses/caddy/ /licenses/
ENV XDG_DATA_HOME=/data XDG_CONFIG_HOME=/config HOME=/data
EXPOSE 80 443
ENTRYPOINT ["/usr/bin/caddy"]
CMD ["run", "--config", "/etc/caddy/Caddyfile", "--adapter", "caddyfile"]
