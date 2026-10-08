# Kasutajakontod ja võistluspõhised rollid

## Rollimudel

Süsteemiülene `User.role` on mõeldud ainult rakenduse administraatori
eristamiseks. Võistluse õigused tulevad `CompetitionMember` liikmelisusest ja
selle `CompetitionMemberRole` kirjetest.

Uue võistluse saab luua ainult süsteemiadministraator. Tavakasutaja võib saada
olemasoleval võistlusel korraldaja, kohtuniku, võistleja, esindaja või vaatleja
rolli, kuid ükski neist rollidest ei anna automaatselt uue võistluse loomise
õigust.

Toetatud võistluse rollid:

- `OWNER` – võistluse omanik, saab hallata ka liikmeid;
- `ORGANIZER` – saab võistlust ja selle tulemusi hallata;
- `JUDGE` – saab sisestada tulemusi, kuid ei saa võistlust seadistada;
- `COMPETITOR` – võistleja kasutajakonto tulevase vaate jaoks;
- `REPRESENTATIVE` – võistkonna esindaja;
- `VIEWER` – sisselogitud vaatleja tulevase vaate jaoks.

Ühel liikmel võib olla samal võistlusel mitu rolli.

## Rollide haldamine

Võistluse **Juurdepääsu** lehel saab olemasoleva kasutajakonto nime või e-posti järgi otsida ning
määrata ja muuta aktiivseid võistlusepõhiseid rolle ühes kohas.

- võistluse omanik ja süsteemiadministraator saavad anda või eemaldada
  `ORGANIZER` rolli;
- kaas-korraldaja saab hallata `JUDGE` ja `REPRESENTATIVE` rolle, kuid ei saa
  ennast ega teist kasutajat korraldajaks tõsta;
- `JUDGE` rolliga tuleb valida vähemalt üks hindamiselement;
- `REPRESENTATIVE` rolliga tuleb valida vähemalt üks võistkond;
- `COMPETITOR` roll tekib võistkonna liikme kasutajakontoga sidumisel
  automaatselt ja käsitsi rollihaldus seda ei eemalda;
- võistluse omaniku `OWNER` rolli ei saa rollihaldusest muuta.

Kasutajale võistluse korraldaja rolli andmine ei muuda tema süsteemiülest
rolli ega anna talle õigust uusi võistlusi luua.

Vaikimisi kuvatakse peakorraldaja ja korraldajad. **Kuva kõik** avab teiste
rollidega kasutajad; loendit saab otsida nime, e-posti, rolli, võistkonna või
elemendi järgi ja kasutajaid kuvatakse kümne kaupa. Lisamise vorm avaneb
loendi kohal. Olemasoleva liikme valimine otsingust laadib tema senised õigused.
Peakorraldajaks saab määrata ainult sama võistluse `ORGANIZER` rolliga kasutaja;
piirangut kontrollitakse ka serveris.

## Kontota kasutaja kutsumine

Kui sisestatud e-posti aadressiga kasutajakontot veel ei ole, saab korraldaja
**Juurdepääsu** lehel saata turvalise kutselingiga e-kirja. Kirjas on kutsuja
nimi, võistluse nimi ja pakutavad rollid. Saatmiseks kasutatakse olemasolevaid
`RESEND_API_KEY` ja `EMAIL_FROM` seadeid; lingi baasiks on `AUTH_URL` (vaikimisi
`https://www.matkamang.ee`).

Saatmise õnnestumine või viga kuvatakse kohe. Kui saatmine ebaõnnestub või
pole seadistatud, jääb kutse kehtima ja korraldaja saab kopeerida lingi või
valida kutsete loendis **Saada uus kutse**, et avada vorm uuesti saatmiseks.
Uue kutse salvestamine muudab varasema lingi kehtetuks.

- kutse kehtib seitse päeva ja selle saab enne vastuvõtmist tühistada või uue
  lingiga asendada;
- kutse saab vastu võtta ainult sama e-posti aadressiga sisse loginud kasutaja;
- konto võib kutse avamise järel luua Google'i sisselogimisega;
- kutse lisab määratud rollid ja ligipääsud ega eemalda kasutaja varasemaid
  võistluse rolle;
- kaas-korraldaja saab kutsuda kohtunikke ja esindajaid, kuid korraldaja rolli
  saab kutses anda ainult võistluse omanik või süsteemiadministraator;
- vastuvõtmisel kontrollitakse uuesti, et kutse saatjal on endiselt vastavate
  õiguste andmise õigus.

Kutselinki ennast andmebaasis ei hoita. Salvestatakse ainult tokeni SHA-256
räsi. Kui soovid lingi ise edastada, kopeeri see enne lehe uuesti laadimist.

## Kasutajakontoga kohtunik

Võistluse **Juurdepääsu** lehel saab korraldaja määrata olemasoleva
kasutajakonto kohtunikuks või luua kontota kasutajale kutselingi ning valida
talle ühe või mitu hindamiselementi.

- kohtunik näeb pärast sisselogimist töölaual jaotist **Minu hindamispunktid**;
- kontopõhine kohtunikuvaade avaneb aadressil
  `/dashboard/judge/[competitionId]`;
- kohtunik saab vaadata ja sisestada tulemusi ainult talle määratud
  elementides;
- elemendi õigust kontrollitakse serveris iga tulemuse lugemise ja
  salvestamise ajal;
- kohtuniku määramise muutmisel jäävad sama kasutaja teised võistluse rollid
  alles.

Tokeniga kohtuniku- ja võistlejalingid jäävad kasutatavaks varuvariandina,
näiteks juhul, kui inimesel ei ole veel kasutajakontot.

## Võistkonna esindaja

`TeamRepresentative` seob võistluse liikme konkreetse võistkonnaga.

- ühel võistkonnal on kuni üks esindaja;
- üks kasutaja võib esindada samal võistlusel mitut võistkonda;
- andmebaasi komposiitvõtmed välistavad eri võistluste liikme ja võistkonna
  eksliku sidumise;
- esindaja roll üksi ei anna kogu võistluse haldusõigust;
- registreerimise ja mandaadi API peab kasutama
  `canManageTeamRegistration()` kontrolli.

Korraldaja saab esindajaid määrata võistluse **Juurdepääsu** lehel. Praeguse esindaja
asendamisel säilivad tema teised rollid ja teiste võistkondade seosed.

## Google’i sisselogimise aktiveerimine

Google’i nupp kuvatakse ainult siis, kui mõlemad keskkonnamuutujad on määratud:

```text
AUTH_GOOGLE_ID
AUTH_GOOGLE_SECRET
```

Google Cloud Console’is loo veebirakenduse OAuth klient ning lisa:

```text
Authorized JavaScript origin:
https://www.matkamang.ee

Authorized redirect URI:
https://www.matkamang.ee/api/auth/callback/google
```

Seejärel lisa mõlemad väärtused Railway `tulemuste-haldus` teenuse muutujatesse.
Saladust ei tohi lisada GitHubi, `.env.example` faili ega logidesse.

Google’i sisselogimine lubab ainult Google’i poolt kinnitatud e-posti. Kui sama
e-postiga paroolikonto on juba olemas, seotakse Google’i konto olemasoleva
kasutajaga ning senised võistluste õigused säilivad.

OAuth kontod salvestatakse `Account` tabelisse. Rakendus kasutab jätkuvalt JWT
sessioone; `Session` ja `VerificationToken` tabelid on lisatud Auth.js adapteri
ühilduvuse ning tulevaste autentimisviiside jaoks.
