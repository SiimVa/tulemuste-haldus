# Tulemuste haldus

Next.js-i ja Prisma rakendus võistluste, võistkondade ning tulemuste
haldamiseks. Rakendus kasutab PostgreSQL-i.

## Kohalik käivitamine

Eeldused:

- Node.js 20 või 22 (projekti `.node-version` kasutab Node.js 20)
- Docker Desktop

```bash
cp .env.example .env
npm ci
npm run db:up
npm run db:deploy
npm run dev
```

Rakendus avaneb aadressil <http://localhost:3000>.

Kasulikud andmebaasikäsud:

```bash
npm run db:migrate   # loob arenduses uue migratsiooni
npm run db:deploy    # rakendab olemasolevad migratsioonid
npm run db:studio    # avab Prisma Studio
npm run db:down      # peatab kohaliku PostgreSQL-i
```

## Kontrollid

```bash
npm test
npm run lint
npx tsc --noEmit
npm run test:e2e
```

Playwright kasutab eraldi kohalikku `e2e` skeemi ja tühjendab selle enne
testivoogu. Turvakontroll ei luba E2E-skriptil kaugserveri andmebaasi
lähtestada.

## Railway

`railway.json` rakendab Prisma migratsioonid enne uue versiooni käivitamist.
Rakenduse `DATABASE_URL` peab viitama Railway PostgreSQL-i privaatsele
ühendusele.

Olemasoleva Railway SQLite-andmebaasi ühekordne üleviimine on kirjeldatud
failis [docs/postgresql-cutover.md](docs/postgresql-cutover.md).

Kasutajakontode, Google’i sisselogimise ja võistluspõhiste rollide kirjeldus on
failis [docs/accounts-and-roles.md](docs/accounts-and-roles.md).

Esindaja registreerimise ja mandaadi töövoog on kirjeldatud failis
[docs/registration-and-mandate.md](docs/registration-and-mandate.md).
