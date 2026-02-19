FROM alpine:latest

# Install dependencies needed for downloading and unzipping
RUN apk add --no-cache \
    ca-certificates \
    unzip \
    wget \
    sqlite \
    tzdata

ENV TZ=Europe/Paris

WORKDIR /pb

# Automatically download the latest version for the correct architecture
# Using sed instead of grep -P for compatibility with Alpine's BusyBox
RUN VERSION=$(wget -qO- "https://api.github.com/repos/pocketbase/pocketbase/releases/latest" | grep "tag_name" | sed 's/.*"v//;s/".*//') && \
    ARCH=$(uname -m) && \
    if [ "$ARCH" = "x86_64" ]; then PB_ARCH="amd64"; \
    elif [ "$ARCH" = "aarch64" ]; then PB_ARCH="arm64"; \
    elif [ "$ARCH" = "arm64" ]; then PB_ARCH="arm64"; \
    else PB_ARCH="amd64"; fi && \
    wget https://github.com/pocketbase/pocketbase/releases/download/v${VERSION}/pocketbase_${VERSION}_linux_${PB_ARCH}.zip && \
    unzip pocketbase_${VERSION}_linux_${PB_ARCH}.zip && \
    rm pocketbase_${VERSION}_linux_${PB_ARCH}.zip

# Copy migrations and hooks from your local folder
# Ensure these folders exist in your pocketbase-backend directory
COPY ./pb_migrations /pb/pb_migrations
# COPY ./pb_hooks /pb/pb_hooks

# Ensure the binary is executable
RUN chmod +x /pb/pocketbase

EXPOSE 8090

# Start PocketBase
CMD ["/pb/pocketbase", "serve", "--http=0.0.0.0:8090"]
