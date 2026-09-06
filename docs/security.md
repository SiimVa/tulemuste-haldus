# Turvalogi ja päringupiirangud

## Kuidas kontrollida

Administraator leiab menüüst **Turvalogi** (`/dashboard/security`). Vaates saab
filtreerida tegevust ja tulemust ning liikuda vanemate sündmusteni. Viimase 24
tunni loendurid näitavad keeldumisi, vigu ja piirangute rakendumist. Logi vaatamine
salvestatakse samuti. Võistluse korraldaja ja tavakasutaja logile ligi ei pääse.

Kahtlust äratavad näiteks korduvad ebaõnnestunud sisselogimised samalt
pseudonüümselt allikalt, ootamatud õiguste muutmised, ekspordid või tulemuste
muutmised. Üks 401/403 või 429 ei tõesta rünnet: põhjuseks võib olla aegunud sessioon
või kasutaja eksimus. Võrdle sündmuste aega Railway rakenduse- ja võrgulogidega
ning oma teadaolevate tegevustega. Kahtluse korral eemalda asjassepuutuvad
võistluse õigused või tühista ligipääsutoken; säilita uurimiseks vajalikud logid
turvalises, piiratud ligipääsuga asukohas.

See PR ei saada automaatseid turvahoiatusi e-postiga. Turvalogi ei ole täielik
ründetuvastussüsteem ega tõend, et andmeleket pole toimunud. Enne paigaldamist
toimunud tegevusi tagasiulatuvalt ei lisata.

## Salvestatav teave ja piirid

- Parooliga sisselogimise ebaõnnestumised ja piirangud, edukad sisselogimised
  (sh Google), rakenduse API muutmispäringud, API ekspordid ning ebaõnnestunud
  API lugemispäringud. Olemasolevad marsruutide õiguskontrollid jäävad kehtima.
- Aeg, tegevuse liik, HTTP-meetod (`AUTH` autentimissündmustel), koodis määratud
  marsruudimall, olekukood, lõpptulemus, tegutseja sisemine ID ning lubatud
  sihtobjekti ID-d. Kohtuniku tokeniga tehtud tulemuse juures on tokeni **sisemine
  ID**, mitte salajane token. Mõnel kogumipäringul on sihiks ainult marsruut,
  mitte kõik muudetud alamobjektid.
- IP-aadressist arvutatakse rakenduse saladusega HMAC-tunnus. Toorest IP-aadressi
  ei säilitata. Konto sisselogimispiirangu võti sisaldab e-posti asemel HMAC-i.
  Neid tunnuseid tuleb käsitleda pseudonüümsete, mitte anonüümsete andmetena.
- Paroole, küpsiseid, autentimispäiseid, salajasi linke, päringu parameetreid,
  vormide sisu ega päringute/vastuste kehasid ei salvestata. Administraatori
  vaade lisab tegutseja praeguse nime kasutajatabelist, mitte ajaloolise koopia.
- Muutmis- ja ekspordipäringule kirjutatakse enne täitmist `STARTED`. Kui logi
  ei saa alustada, vastab API 503-ga ja toimingut ei täideta. Lõpptulemuse
  salvestamise tõrke korral jääb `STARTED` alles ning Railway rakenduslogisse
  läheb `Security audit completion failed` koos sündmuse ID-ga. `STARTED` ei
  tähenda, et toiming kindlasti ebaõnnestus: see võib olla pooleli või õnnestunud.
- Tabelitel puuduvad kasutaja/võistluse kustutamisega kaskaadseosed. Rakendusel
  ei ole turvalogi muutmise ega käsitsi kustutamise API-t. Andmebaasi haldaja
  saab siiski kirjeid muuta: see ei ole võltsimiskindel väline auditiladu.
- Edukaid tavalisi GET-päringuid, serverkomponentide lehevaatamisi (sh print ja
  avalikud tulemused), Auth.js sisemisi sessiooni/CSRF-päringuid, cron-kutseid,
  andmebaasi otsepöördumisi ja Railway haldustoiminguid siin ei auditeerita.
  Kõikide andmelugemiste ja andmelekete tuvastamiseks on vaja täiendavat seiret.

Logide sisu ja ligipääsu piiramisel on lähtutud
[OWASP logimisjuhisest](https://cheatsheetseries.owasp.org/cheatsheets/Logging_Cheat_Sheet.html).

## Päringupiirangud

Loendurid asuvad PostgreSQL-is. `INSERT … ON CONFLICT` uuendab neid atomaar­selt;
kõik rakenduse eksemplarid kasutavad sama andmebaasi aega. Aken algab esimesest
päringust ning hilisemad päringud selle lõppu edasi ei lükka.

| Liik | Piirang | Jaotus |
| --- | --- | --- |
| Parooliga sisselogimine | 10 / 15 min | Normaliseeritud e-posti HMAC |
| Parooliga sisselogimine | 60 / 15 min | Allika HMAC; kontrollitakse enne konto võtit |
| Sisselogitud API lugemine | 600 / min | Kasutaja, kõigi tavaliste API-de peale kokku |
| Sisselogitud API muutmine | 240 / min | Kasutaja, kõigi tavaliste API-de peale kokku |
| Sessioonita API lugemine | 240 / min | Allika HMAC |
| Sessioonita API muutmine (sh tokeniga kohtunik) | 60 / min | Allika HMAC |
| API eksport | 20 / min | Kasutaja või sessioonita allikas |
| Oma parooli muutmine | 10 / 15 min | Kasutaja |
| Algseadistus | 5 / 15 min | Allika HMAC |

API vastab piirangu puhul HTTP 429 ja `Retry-After` päisega. Parooliga
sisselogimine säilitab Auth.js üldise ebaõnnestunud sisselogimise vastuse
(konto olemasolu ei avaldata), kuid turvalogis on tulemus `RATE_LIMITED`.
Loendatakse nii õnnestunud kui ka ebaõnnestunud katseid. Logisse läheb ainult
esimene piirangut ületav katse akna kohta; turvalogi 24 tunni piirangute loendur
ei näita kõigi blokeeritud päringute arvu.

Railways kasutatakse platvormi lisatud `X-Real-IP` päist ainult siis, kui
`RAILWAY_ENVIRONMENT_ID` on olemas. Rakendus ei usalda kliendi saadetud
`X-Forwarded-For` väärtust. Päiste kirjeldus:
[Railway võrgu dokumentatsioon](https://docs.railway.com/networking/public-networking/specs-and-limits).
See eeldab, et avalikud päringud sisenevad Railway usaldatud servaproksi kaudu;
otse rakenduse porti ei tohi väljast ligi pääseda.

Mujal või puuduva/vigase IP korral kasutatakse ühist `unknown` allikat.
See on konservatiivne varuvariant, mitte kasutajate eristamine. Ära lisa
Railway keskkonnatunnust käsitsi otse internetti avatud serverile. Teise
majutuse jaoks tuleb usaldatud proksi lahendus eraldi läbi mõelda. Ühise võrgu
taga olevad sessioonita kohtunikud jagavad IP-piirangut; jälgi võistlusel 429
sündmusi ning kohanda vajaduse korral poliitikat koormustesti põhjal.

Need on rakendusepoolsed piirangud, mitte võrgu/DDoS-kaitse. Enne piirangu
kontrolli toimub sessiooni lugemine ja mõni andmebaasipäring; hajutatud suurte
rünnete jaoks on vaja võrgu taseme kaitset ja seiret.

## Sessioonid ja turvapäised

JWT sessiooni lugemisel kontrollitakse kasutaja olemasolu ja praegust globaalset
rolli andmebaasist. Kustutatud konto sessioon ei anna enam juurdepääsu ning
ADMIN-rolli eemaldamine jõustub järgmisel päringul. Juba käimasolevat toimingut
see tagasi ei pööra. Parooli muutmine ei tühista selles PR-is kõiki varem
väljastatud sessioone; see vajab eraldi sessiooniversiooni/tühistamise lahendust.

Kõigil vastustel on `nosniff`, `no-referrer` ja kaamera/mikrofoni/asukoha
Permissions-Policy. Tootmiskoostes lisatakse HSTS (ilma aladomeenide sunnita).
Töölaud, sisselogimine ning salajaste linkidega vaated lubavad raamistamist
ainult sama päritoluga lehelt. Avalikud nimekirjad jäävad välisele kodulehele
manustatavaks. CSP piirab raamimist, objekte ja baasaadressi; see ei ole veel
range skriptide CSP ega täielik XSS-kaitse.

## Railway kasutuselevõtt

1. Tavapärane deploy rakendab uued Prisma migratsioonid. Olemasolevad
   `AUTH_SECRET` või `NEXTAUTH_SECRET` peavad olema määratud; uut saladust
   selle PR-i jaoks vaja ei ole. Saladuse vahetamisel muutuvad ka HMAC-tunnused.
2. Olemasolev igapäevane `personal-data-retention` cron eemaldab lisaks
   üle 90 päeva vanad turvasündmused ja aegunud päringuloendurid. Eraldi
   Railway teenust ei lisata. Kui cron ei käivitu, säilivad vanad kirjed kauem.
3. Ava administraatorina Turvalogi, tee üks teadaolev muudatus ja kontrolli,
   et tulemus on „Õnnestus”. Kontrolli cron-i järgmise käivituse edukust.
4. Jälgi `Security service unavailable` ja `Security audit completion failed`
   rakenduslogisid. Teavitus nende vigade või kahtlaste mustrite kohta tuleks
   järgmise etapina ühendada automaatse välise seirega.

Kontrollid: `npm test`, `npm run lint`, `npx tsc --noEmit`, `npm run build` ja
`npm run test:e2e` kohalikul PostgreSQL-i testiskeemil. Turvatestid kontrollivad
konkurentseid loendureid, aegumist, 429 vastuseid, õiguste eemaldamist,
kustutatud konto sessiooni, logi privaatsust, administraatoripiiri, päiseid ja
säilitustähtaja koristust. Need ei asenda sõltumatut turvaauditit.
