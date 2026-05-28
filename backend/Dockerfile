# PocketBase backend for ScribRx.
# Builds a minimal image that bundles the pb_hooks/ custom routes.
FROM alpine:3.20

ARG PB_VERSION=0.28.4

RUN apk add --no-cache ca-certificates unzip wget

WORKDIR /pb

# Download the PocketBase binary for the target architecture.
RUN ARCH="$(uname -m)" && \
    case "$ARCH" in \
      x86_64)  PB_ARCH=amd64 ;; \
      aarch64) PB_ARCH=arm64 ;; \
      *) echo "unsupported arch: $ARCH" && exit 1 ;; \
    esac && \
    wget -q "https://github.com/pocketbase/pocketbase/releases/download/v${PB_VERSION}/pocketbase_${PB_VERSION}_linux_${PB_ARCH}.zip" -O /tmp/pb.zip && \
    unzip /tmp/pb.zip -d /pb && \
    rm /tmp/pb.zip

# Bundle the custom hooks. Collections are imported via the Admin UI or migrations.
COPY pb_hooks /pb/pb_hooks

EXPOSE 8090

# pb_data is expected to live on a mounted volume so it survives restarts.
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
