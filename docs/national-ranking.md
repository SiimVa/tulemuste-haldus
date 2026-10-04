# Üleriiklik arvestus

Üleriiklik arvestus ühendab mitme osavõistluse tulemused üheks pingereaks.
Osavõistlused jäävad eraldi võistlusteks: igaühel on oma korraldajad, KP-d,
hindamine ja pingerida. Arvestus loeb osavõistlustel salvestatud punkte ega
muuda neid.

Arvestust haldab ainult administraator (administraatori menüü
**Üleriiklik arvestus**). Avaldatud arvestusel on avalik pingerida,
ülevaade, ekraanirežiim ja analüüs nagu võistlusel. Osavõistluste vaateid see
ei muuda: üleriiklik koht on näha ainult üleriiklikes vaadetes.

## Vaated

Administraatori arvestuse lehel on sakid:

- **Pingerida** — osavõistluste keskmised ja N, reeglite kontroll ning
  pingerida. Pingereas on iga KP tähis eraldi veerus; arvesse minevad KP-d on
  tumedad, arvestamata hallid. Klassifilter, vahed eelmise ja esimesega,
  Exceli eksport ja prinditav pingerida on nagu võistlusel.
- **Ülevaade** — vidinad: põhinumbrid, parimad võistkonnad, osavõistluste
  võrdlus, klasside võrdlus, tihedad heitlused ja KP-d osavõistlustes.
- **Analüüs** — võistkonna vaade (üld- ja klassikoht, KP-d osavõistluse
  keskmisega, arvestatud KP-d, karistused) ja KP-de võrdlus osavõistluste
  vahel. KP-de võrdluses on esile tõstetud osavõistlus, kus KP oli raskeim
  (protsendina maksimumist).
- **Avalik vaade** — avaldamine, külmutamine, analüüsi ligipääs ja ülevaate
  vidinad.

Avalikud aadressid on `/public/series/<id>` (pingerida), `/overview`,
`/screen` ja `/analysis`.

## Avaldamine ja külmutamine

- Avalikud vaated avanevad ainult avaldatud arvestusel; avaldamata arvestust
  näeb administraator eelvaatena. Arvestust ei lisata avalike võistluste
  nimekirja, seega jaga linki ise.
- Kui osavõistluse pingerida on külmutatud, näitavad avalikud üleriiklikud
  vaated selle osavõistluse külmutamise hetke seisu. Peidetud tulemused ei
  leki üleriikliku arvestuse kaudu.
- Üleriikliku arvestuse saab ka ise külmutada (kohe või ajastatult). Siis
  näitavad avalik pingerida, ülevaade ja ekraan külmutamise hetke seisu ning
  analüüs on suletud kuni avalikustamiseni. Administraator näeb jooksvat
  seisu.
- Analüüsi ligipääs on nagu võistlusel: avalik, ainult lingiga
  (`/analysis/series/<tunnus>`) või suletud.
- Ülevaate iga vidina saab näidata administraatorile ja/või avalikus vaates;
  järjekord ja lävendid (parimate arv, tiheda heitluse piir, ekraani vahetus)
  on samas.

## Arvutus

1. Iga osavõistluse kohta arvutatakse keskmine läbitud KP-de arv. Läbitud KP on
   sooritus, „Ebaõnnestus” või „Läbis, aga ei sooritanud”; „Ei läbinud” ja muu
   erand ei ole. Keskmisesse loetakse arvestuses olevad võistkonnad, kellel on
   vähemalt üks KP tulemus. Arvestusvälised, katkestanud (kogu võistkond) ja
   startimata võistkonnad ei ole arvestuses.
2. Keskmine ümardatakse matemaatiliselt (11,5 → 12, 11,4 → 11).
3. Arvestatav KP-de arv N on osavõistluste ümardatud keskmistest väikseim.
4. Võistkonna tulemus = N parima KP punktid + karistused täies ulatuses.
   KP punktid on osavõistlusel arvutatud punktid koos erandiga: näiteks
   „Ei läbinud” miinuspunktid on selle KP tulemus ega lähe arvesse, kui
   võistkonnal on N paremat KP-d.
5. Karistused on vastutegevus, varustuskontroll, hilinemine, katkestamine
   (liikme katkestamise karistus), muu element ja käsitsi karistused.
6. Postkastid, käsitsi sisestatavad elemendid ja tühistatud elemendid
   arvestusse ei lähe. Arvestuse lehel on need eraldi loetletud.
7. Võrdse tulemusega võistkonnad jagavad kohta. Klassikoht arvutatakse sama
   nimega klasside vahel üle kõigi osavõistluste.

Kõigil osavõistlustel peab olema sama hindamissüsteem (punktid või
karistuspunktid), muidu pingerida ei arvutata. Karistuspunktide süsteemis on
parimad need KP-d, kus karistus on väikseim.

## Reeglite kontroll

Arvestuse leht võrdleb osavõistluste sama tähisega KP-sid ja karistuselemente:

- tüüp ja tühistamine;
- maksimum (elemendi oma või võistluse vaikeväärtus);
- arvutusmeetod koos parameetritega;
- erandid koos liigi ja karistusega;
- väljad: nimi, tüüp, järjestus, valem ja seaded;
- hindamisosad ja elemendi seaded (nt hilinemise intervall).

Nimesid ega asukohti ei võrrelda. Vaikeväärtused loetakse samaks: näiteks
puuduv miinimum ja miinimum 0. Kui erinevus pole kirjelduses näha (nt välja
seaded), tähistatakse variandid tähtedega A, B jne. Kontroll näitab ka
elemente, mis mõnel osavõistlusel puuduvad.

## Eksport

Exceli failis on kolm lehte:

- pingerida koos arvestatud KP-dega;
- osavõistluste keskmised ja N;
- reeglite kontroll.

## Märkused

- Arvestus arvutatakse lehe avamisel osavõistluste praegustest punktidest.
- Kuni mõni osavõistlus pole lõppenud, on arvestus esialgne.
- Osavõistluse ümberarvutus muudab ka arvestust.
