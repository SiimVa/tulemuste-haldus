# Üleriiklik arvestus

Üleriiklik arvestus ühendab mitme osavõistluse tulemused üheks pingereaks.
Osavõistlused jäävad eraldi võistlusteks: igaühel on oma korraldajad, KP-d,
hindamine ja pingerida. Arvestus loeb osavõistlustel salvestatud punkte ega
muuda neid.

Arvestust näeb ja muudab ainult administraator (administraatori menüü
**Üleriiklik arvestus**). Avalikku vaadet veel pole.

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
