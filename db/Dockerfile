FROM golang:1.26.11-alpine@sha256:ae52b5bc6ed045a9ed26ab03dc19327a802a9cc9aa8b27ed57f5c6b60579b0bb AS gosu
ENV CGO_ENABLED=0 GOTOOLCHAIN=local
ADD --checksum=sha256:cd9719b775dbfedae53923c9b0dc792b66d42c51e0b36652ed6f747fbadc0164 https://github.com/tianon/gosu/archive/refs/tags/1.19.tar.gz /src/gosu.tar.gz
RUN mkdir /build && tar -xzf /src/gosu.tar.gz -C /build --strip-components=1
WORKDIR /build
# SPH: retain gosu source, update the reviewed passwd/group parser dependency.
COPY gosu/go.mod gosu/go.sum ./
RUN go mod download && go mod verify && go build -mod=readonly -trimpath -buildvcs=false -ldflags '-w' -o /out/gosu . \
 && /out/gosu --version && /out/gosu nobody id

FROM alpine:3.24.3@sha256:be2656061b536c1883c4034790e21d0a09c5aaaf51968b89368a3c0371ea2c9a AS xml
RUN apk add --no-cache build-base zlib-dev xz-dev
ADD --checksum=sha256:a2c9ae7b770da34860050c309f903221c67830c86e4a7e760692b803df95143a https://download.gnome.org/sources/libxml2/2.13/libxml2-2.13.9.tar.xz /src/libxml2.tar.xz
RUN mkdir /build && tar -xJf /src/libxml2.tar.xz -C /build --strip-components=1
COPY patches/ /patches/
WORKDIR /build
RUN patch -p1 < /patches/CVE-2026-6732.patch \
 && patch --fuzz=0 -p1 < /patches/CVE-2026-86140.patch \
 && echo "b8a6c6a58be267f131129dc2458c796166db483b3538cecfb003df49f8e13098  parser.c" | sha256sum -c - \
 && echo "f3e1e845441670751c183cc626ede221cb2011f442d6e3d13c70cc302d109182  valid.c" | sha256sum -c - \
 && ./configure --prefix=/usr --sysconfdir=/etc --with-legacy --with-lzma --with-zlib --without-python \
 && make -j2 && make DESTDIR=/out install

FROM postgres:16.16-alpine3.24@sha256:0adbf25a9e96d38823bb813f3ac0ed41fadb665c88f1df7fe6dbfb060cbdc106
RUN apk add --no-cache 'zlib>=1.4-r0' 'krb5-libs>=1.22.3-r0' 'libxslt>=1.1.43-r4' && rm -f /usr/local/bin/gosu
COPY --from=gosu /out/gosu /usr/local/bin/gosu
COPY --from=xml /out/usr/lib/libxml2.so.2.13.9 /usr/lib/libxml2.so.2.13.9
ENV TZ=Asia/Tokyo
COPY licenses/ /licenses/
