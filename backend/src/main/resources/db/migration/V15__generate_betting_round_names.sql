ALTER TABLE lmuml.betting_rounds DROP COLUMN name;

ALTER TABLE lmuml.betting_rounds
    ADD COLUMN name TEXT GENERATED ALWAYS AS ('Runda ' || number::text) STORED NOT NULL;
