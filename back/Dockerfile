FROM debian:stable-slim
FROM rust:slim

WORKDIR /app

COPY . .

RUN cargo build --release

EXPOSE 8080

CMD [ "./target/release/app" ]