# Registreerimine ja mandaat

## Töövoog

Võistkonna andmed liiguvad kahes eraldi etapis:

1. **Registreerimine** – esindaja kontrollib võistkonna nime ja klassi ning
   esitab need korraldajale.
2. **Mandaat** – pärast registreerimise kinnitamist täpsustab esindaja lõpliku
   võistlejate ja tugiliikmete koosseisu.

Mõlemal etapil on olekud:

- `DRAFT` – esindaja saab andmeid muuta;
- `SUBMITTED` – andmed ootavad korraldaja läbivaatamist ja on esindajale
  lukus;
- `APPROVED` – korraldaja on etapi kinnitanud;
- `CHANGES_REQUESTED` – korraldaja saatis etapi märkusega parandamisele.

Mandaat avaneb alles pärast registreerimise kinnitamist. Mandaadi esitamiseks
peab võistkonnal olema vähemalt üks `COMPETITOR` rolliga liige.

## Esindaja vaade

Esindaja näeb dashboard'il jaotist **Minu esindatavad võistkonnad**. Sealt
avaneb ainult talle määratud võistkonna registreerimise ja mandaadi vorm.

Esindaja:

- ei saa kasutada võistluse üldist haldus-API-t;
- ei saa muuta teisi sama võistluse võistkondi;
- ei saa muuta esitatud või kinnitatud etappi;
- ei saa muuta registreerimist pärast võistluse aktiveerimist.

## Korraldaja vaade

Võistluse lehel on jaotis **Registreerimine**, kus omanik, korraldaja või
süsteemiadministraator näeb kõigi võistkondade olekuid, esindajat ja mandaadi
koosseisu. Esitatud etapi saab kinnitada või märkusega parandamisele saata.

Esindaja määratakse jätkuvalt võistluse **Seaded** lehel.

## Isikuandmed

Esimene versioon kogub mandaadis ainult liikme nime ja rolli. Isikukoodi,
sünniaega, terviseandmeid ega muid tundlikumaid välju ei lisata enne, kui
nende töötlemise eesmärk, säilitustähtaeg ja ligipääsureeglid on eraldi kokku
lepitud.
