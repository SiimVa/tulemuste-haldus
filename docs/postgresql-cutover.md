# Railway SQLite → PostgreSQL

See on ühekordne tootmisandmete üleviimine. Ülekandeskript ei kustuta
SQLite-faili ja keeldub kirjutamast PostgreSQL-i, kui sihttabelites on juba
andmeid.

## 1. Valmista katkestus ette

1. Tee Railway volume'ist varukoopia.
2. Leia rakenduse senisest `DATABASE_URL` väärtusest kasutatav SQLite-fail.
3. Laadi aktiivne SQLite-fail Railway volume'i failivaaturi kaudu arvutisse.
4. Peata enne lõplikku koopiat rakenduses andmete muutmine. Vajadusel peata
   veebiteenus ajutiselt, et pärast koopiat ei tekiks SQLite-i uusi kandeid.
5. Hoia SQLite-fail ja volume alles vähemalt seni, kuni uus versioon on
   kontrollitud.

## 2. Loo Railway PostgreSQL

1. Lisa samasse Railway projekti PostgreSQL-i teenus.
2. Luba PostgreSQL-i varukoopiad.
3. Kasuta kohalikust arvutist andmete kopeerimiseks PostgreSQL-i ajutist
   avalikku ühendusstringi. Ära lisa seda faili ega GitHubi.

## 3. Kopeeri andmed

Käivita projekti juurkaustas:

```bash
SQLITE_DATABASE_URL="file:/absoluutne/tee/railway.db" \
DATABASE_URL="postgresql://kasutaja:parool@avalik-host:port/railway" \
CONFIRM_SQLITE_TO_POSTGRES=yes \
npm run db:migrate-from-sqlite
```

Skript:

1. rakendab uuele PostgreSQL-ile Prisma migratsioonid;
2. kontrollib, et sihtandmebaas oleks tühi;
3. kopeerib kõik tabelid sõltuvuste järjekorras ühe tehinguna;
4. võrdleb iga tabeli ridade arvu.

Kui skript katkeb kopeerimise ajal, pööratakse andmete tehing tagasi. Migratsiooni
tehnilised tabelid võivad alles jääda; enne uut katset veendu, et rakenduse
tabelid on tühjad või loo uus tühi PostgreSQL-i andmebaas.

## 4. Lülita rakendus PostgreSQL-ile

1. Sea rakenduse Railway teenuses `DATABASE_URL` viitama PostgreSQL-i
   privaatsele muutujale, tavaliselt `${{Postgres.DATABASE_URL}}`.
2. Käivita uus deploy. `railway.json` käivitab `npm run db:deploy` pre-deploy
   etapis ja alles siis Next.js-i serveri.
3. Kontrolli vähemalt:
   - administraatori sisselogimist;
   - võistluste, võistkondade ja tulemuste arvu;
   - kohtuniku ning võistleja linke;
   - tulemuse lisamist ja pingerea arvutamist.
4. Eemalda PostgreSQL-i avalik ligipääs, kui seda enam ei vajata.

## Tagasipööramine

Kui kontroll ebaõnnestub, peata uued kirjutused, taasta eelmine Railway
rakenduse versioon ja selle SQLite-i `DATABASE_URL`. Ära kustuta PostgreSQL-i
ega SQLite-i varukoopiat enne, kui ebaõnnestumise põhjus ja uuesti tehtava
ülekande lähteandmed on selged.
