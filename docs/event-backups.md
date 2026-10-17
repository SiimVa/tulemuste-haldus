# Võistluspäeva varukoopiad 17.10.2026

Railway teenus `event-backups-2026-10-17` teeb kogu tootmisandmebaasist
PostgreSQL-i loogilise varukoopia iga 30 minuti järel kell 10:00–21:00
(Europe/Tallinn), kaasa arvatud mõlemad otspunktid: kokku 23 ajastatud koopiat.
Railway UTC ajastus on `0,30 7-18 17 10 *`. Kell 21:30 käivitus ei tee koopiat.
Skript sisaldab täpset kuupäevapiirangut: teistel kuupäevadel ei varundata.

Koopiad asuvad sama projekti privaatses Railway `Postgres-PITR` salvestusruumis
prefiksiga `event-backups/2026-10-17/`. Olemasolevat WAL/PITR arhiivi ei muudeta.
Iga ajapunkt annab `.dump` arhiivi ja `.json` kontrollfaili. Eduka ajapunkti
korduskäivitus ei tekita uut koopiat. Enne kella 10:00 teeb teenuse juurutus
ühe eraldi nimega proovikoopia; seda ei esitata kella 10:00 koopiana.

Enne üleslaadimist dekodeeritakse kogu arhiiv ja taastatakse see samas
ühekordses konteineris eraldatud PostgreSQL-i andmebaasi. Taastamise ühendus
on sõnaselgelt `127.0.0.1:5433`, mitte tootmisandmebaas. Kontrollfail sisaldab
faili suurust, SHA-256 räsi ning taastamise kontrolli tulemust ja tabelite arvu.
Üleslaetud faili suurust ja räsi kontrollitakse S3 metaandmetega.

Andmebaasi ja S3 ligipääsud on teenuse Railway keskkonnamuutujates, mitte
repos ega logides. Teenus kasutab privaatset andmebaasiühendust. Skripti ja
ajastuse lähtekood asub `scripts/railway/event-backup-service/` all;
ajastuse testid käivituvad käsuga `node --test scripts/railway/event-backups.test.mjs`.

Taastamiseks laadi alla soovitud `.dump` ja kontrollfail, võrdle SHA-256 räsi
ning kasuta PostgreSQL 18 `pg_restore` tööriista eraldi taastamisandmebaasis.
Kogu andmesisu, sh tulemused, võistkonnad ja seadistused, sisaldub arhiivis;
serveri kasutajarolle ja nende õigusi loogiline koopia ei loo.

Varundus säilitab koopiad; automaatset kustutamist pole seadistatud.
Lisaks tehti seadistamisel Railway andmebaasi- ja rakendusketta proovivarukoopiad.
