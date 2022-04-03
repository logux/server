FROM ubuntu:20.04

RUN apt update
RUN apt-get install -y curl

RUN curl -fsSL https://deb.nodesource.com/setup_17.x | bash -
RUN apt-get install -y nodejs

RUN npm config set update-notifier false
RUN npm i -g pnpm

WORKDIR /usr/src/app

COPY pnpm-lock.yaml ./
RUN pnpm fetch

COPY . ./

RUN pnpm install -r --offline

ENV FORCE_COLOR=2

RUN useradd tester
USER tester

CMD ["node"]
