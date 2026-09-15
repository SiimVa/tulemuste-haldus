# Isikuandmete säilitamine

## Millised andmed kustutatakse

Võistluse **Registreerimise seadetes** määratakse säilitustähtaeg 1–90 päeva
pärast võistluse lõppkuupäeva. Vaikimisi on tähtaeg 90 päeva.

Tähtaja saabumisel:

- kustutatakse e-posti ja telefoni tüüpi vormiväljade väärtused;
- kustutatakse korraldaja poolt isikuandmeteks märgitud vabateksti- ja
  kuupäevaväljade väärtused;
- eemaldatakse liikmete loenditest e-post, telefon ja sünniaeg;
- eemaldatakse võistkonna liikme kirjest e-posti koopia.

Võistkonna nimi, liikmete nimed, kapteni- ja muud rollid ning tulemused
säilivad võistluse ajaloos. Kasutajakontot ei kustutata, sest konto kuulub
kasutajale ja võib olla seotud teiste võistlustega.

## Eeldused

Automaatseks kustutamiseks peab võistlusel olema lõppkuupäev. Juba kustutatud
andmeid ei saa taastada. Korraldaja näeb seadetes täpset kustutamise tähtaega
ja saab tähtaja saabumisel puhastuse ka käsitsi käivitada.

## Igapäevane automaatne käivitus

Sea rakenduse teenuses pikk juhuslik `CRON_SECRET` ja lase usaldatud
ajastajal teha kord päevas päring:

```bash
curl --fail --silent --show-error \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/internal/personal-data-retention"
```

`APP_URL` on rakenduse HTTPS-aadress ilma lõpus oleva kaldkriipsuta. Endpoint
tagastab kustutatud võistluste arvu ja ei töötle võistlusi enne nende
säilitustähtaja saabumist.

## Prognoosi jaoks säiliv registreerimisstatistika

`Competition.registrationStatistics` sisaldab versiooniga päevakokkuvõtet:
registreerimise algus ja lõpp, kohtade piir, andmete seis ning kumulatiivsed
esitatud, aktiivsete, kinnitatud, loobunud ja tagasi lükatud avalduste arvud.
Kokkuvõttes pole inimeste ega võistkondade nimesid, kontaktandmeid või
kasutaja- ja avaldusetunnuseid.

Kokkuvõte salvestatakse osalejate nimekirja kinnitamise tehingus ja enne
isikuandmete puhastamist. Kui nimekiri kinnitatakse enne seadistatud tähtaega,
kasutatakse kokkuvõttes lõpuna kinnitamise aega. Olemasolevate lõppenud
registreerimiste puuduvaid kokkuvõtteid täidab sama igapäevane hooldustöö
kuni 100 võistluse kaupa, ka juba puhastatud võistlustel. Enne tagantjärele
salvestamist saab prognoosivaade olemasolevast sündmuste ajaloost kokkuvõtte
lugemisel arvutada. Andmeteta ajalugu ei taastata oletuste abil.

Kontaktandmete puhastamine ei kustuta avaldusi, sündmusi ega statistikat.
Võistluse täielik kustutamine eemaldab ka kokkuvõtte. Kopeeritud võistlus
alustab uue registreerimisajalooga.

Kasutuselevõtt nõuab migratsiooni `20260915120000_registration_statistics`
(`npm run db:deploy`) ja Prisma kliendi genereerimist. Igapäevane hooldustöö
kasutab olemasolevat ülal kirjeldatud ajastajat; uut ajastajat pole vaja.
