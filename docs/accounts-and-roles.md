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

## Võistkonna esindaja

`TeamRepresentative` seob võistluse liikme konkreetse võistkonnaga.

- ühel võistkonnal on kuni üks esindaja;
- üks kasutaja võib esindada samal võistlusel mitut võistkonda;
- andmebaasi komposiitvõtmed välistavad eri võistluste liikme ja võistkonna
  eksliku sidumise;
- esindaja roll üksi ei anna kogu võistluse haldusõigust;
- registreerimise ja mandaadi API peab kasutama
  `canManageTeamRegistration()` kontrolli.

Korraldaja saab esindajaid määrata võistluse seadete lehel. Praeguse esindaja
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
