# Kauguste hindamine veaprotsendi järgi

Elemendi sisendvälja tüüp **Kauguste hindamine (veaprotsent)** sisaldab mitut kaugust. Igal kaugusel on nimetus ja õige väärtus. Ühine punktitabel rakendub igale pakkumisele eraldi.

## Seadistamine

1. Lisa sisendväli tüübiga **Kauguste hindamine (veaprotsent)**. Märgi see esmaseks tulemusväljaks, kui hindamine koosneb ainult kaugustest.
2. Lisa kaugused ükshaaval või nupuga **Lisa 10 kaugust**. Nimetused peavad olema erinevad; kasutada saab kuni 100 kaugust.
3. Sisesta õiged kaugused või jäta need kohtunikule täitmiseks tühjaks. Õige kaugus peab olema positiivne; nulli korral pole protsendivea arvutus määratud.
4. Seadista mõõtühik ja punktitabel. Vaikimisi: kuni ±5% annab 3 p, kuni ±15% 2 p, kuni ±30% 1 p ning suurem eksimus 0 p. Piirväärtused kuuluvad vastavasse vahemikku.
5. Vali arvutuses kasutatav tulemus: punktide summa, protsendivigade summa või kaugusvigade summa. Kõik kolm summat kuvatakse ka sõltumatult valikust.

Otse teenitud punktide kasutamiseks vali arvutusmeetod **Absoluutsed punktid**. Pingerea järgi hindamisel vali punktisummale suund „suurem on parem“, veasummale „väiksem on parem“. Valemis tähistab selle välja nimi valitud tulemust; näiteks `kaugused + lisapunktid`.

## Kohtunik

Kohtunikuvaate jaotises **Õiged kaugused** saab kohtunik määrata või parandada talle lubatud elemendi õigeid väärtusi. Need kehtivad kõigile võistkondadele. Salvestamisel arvutatakse olemasolevate pakkumiste tulemused uuesti; võistkondade pakkumised säilivad. Kohtunik ei saa selle toiminguga muuta punktitabelit, kauguste nimetusi ega hindamisviisi.

Pärast õigete kauguste määramist valib kohtunik võistkonna ja sisestab kõik pakkumised. Iga rea juures kuvatakse absoluutne viga, protsendiviga ja punktid. Null on lubatud pakkumine; puuduv või negatiivne pakkumine ei ole kehtiv tulemus.

## Arvutus

- Kaugusviga: `abs(pakkumine − õige kaugus)`.
- Protsendiviga: `kaugusviga / õige kaugus × 100`.
- Veasummad: iga rea absoluutse kaugusvea ja protsendivea summa. Ala- ja ülehindamine ei tühista teineteist.
- Punktivahemik valitakse ümardamata vea järgi; kuvamine kasutab vähemalt ühte komakohta.

Näide: õiged kaugused 100 m ja 200 m, pakkumised 110 m ja 180 m. Vead 10 m ja 20 m, mõlemal 10%; kokku 30 m ja 20%, punkte 2 + 2 = 4. Protsendivigade summa ei ole keskmine protsent ja võib ületada 100%.

## Import ja eksport

Exceli sisestusmallis on iga kauguse jaoks eraldi veerg kujul `Välja nimetus (Kauguse nimetus)`. Ekspordis on lisaks pakkumistele punktide summa ja mõlemad veasummad. Import valideerib pakkumised samade reeglitega nagu kohtuniku sisestus.

Andmebaasi migratsiooni pole vaja: uus väljatüüp on `ESTIMATION`, seadistus säilib välja `meta.estimation` objektis ja võistkonna pakkumised `Result.values` välja sees JSON-stringina. Õigete kauguste muutmise API kontrollib korraldaja/kohtuniku õigusi ja tokeni võistluse ning elemendi ulatust.
