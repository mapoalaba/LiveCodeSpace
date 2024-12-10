# infrastructure/docker/terminal/terminal-env/Dockerfile
FROM ubuntu:20.04

# 기본 도구 설치
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    nodejs \
    npm \
    git \
    curl \
    wget \
    vim \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# AWS CLI 설치
RUN curl "https://awscli.amazonaws.com/awscli-exe-linux-x86_64.zip" -o "awscliv2.zip" \
    && unzip awscliv2.zip \
    && ./aws/install \
    && rm -rf aws awscliv2.zip

# 작업 디렉토리 설정
WORKDIR /workspace

# 보안 설정
RUN useradd -m -s /bin/bash coder
USER coder

# 환경 변수 설정
ENV TERM=xterm-256color
ENV SHELL=/bin/bash

CMD ["/bin/bash"]