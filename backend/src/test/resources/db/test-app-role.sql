-- Disposable test database only; these credentials are not used outside tests.
CREATE ROLE lmuml_app_test LOGIN PASSWORD 'test-only-app-password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE lmuml_test TO lmuml_app_test;

CREATE ROLE lmuml_migrator_test LOGIN PASSWORD 'test-only-migrator-password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE lmuml_test TO lmuml_migrator_test;

CREATE ROLE lmuml_importer_test LOGIN PASSWORD 'test-only-importer-password'
    NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
GRANT CONNECT ON DATABASE lmuml_test TO lmuml_importer_test;

CREATE SCHEMA lmuml AUTHORIZATION lmuml_migrator_test;
GRANT USAGE ON SCHEMA lmuml TO lmuml_app_test;
GRANT USAGE ON SCHEMA lmuml TO lmuml_importer_test;
