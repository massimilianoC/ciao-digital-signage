# Docker Infra

This folder contains containerization artifacts.

## Files

- `Dockerfile`: production image build.
- `docker-compose.dev.yml`: local auxiliary services (MailHog).
- `docker-compose.yml`: full local stack (app + Mongo + MailHog).
- `docker-compose.prod.yml`: production-like stack.

## Usage

From repository root:

- `docker compose -f infra/docker/docker-compose.dev.yml up -d`
- `docker compose -f infra/docker/docker-compose.yml up -d`
- `docker compose -f infra/docker/docker-compose.prod.yml up -d`
