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
