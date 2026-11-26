FROM eclipse-temurin:25.0.5_8-jdk-noble@sha256:3c35c595580ae3342eb34e5832e8e516ded8e767efa4a5fe61b8644d44847b8e AS build

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl unzip \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /build
COPY pom.xml mvnw ./
COPY .mvn/ .mvn/
COPY src/main/ src/main/

RUN --mount=type=cache,target=/root/.m2,sharing=locked \
    sh ./mvnw --batch-mode --no-transfer-progress -Dmaven.test.skip=true package

FROM eclipse-temurin:25.0.5_8-jre-noble@sha256:23481dc33a759b79d62814ceb1ec27a0d1a84da9d7aab0609577427176fbb1b7

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl \
    && rm -rf /var/lib/apt/lists/* \
    && groupadd --gid 10001 lmuml \
    && useradd --uid 10001 --gid lmuml --no-create-home --shell /usr/sbin/nologin lmuml

WORKDIR /app
COPY --from=build /build/target/lmuml-backend.jar ./
USER 10001:10001
ENV SERVER_ADDRESS=0.0.0.0
EXPOSE 8080

ENTRYPOINT ["/__cacert_entrypoint.sh", "java", "-jar", "/app/lmuml-backend.jar"]
