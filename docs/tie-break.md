# Võrdsete punktide viigilahutus

Võistluse **Seaded → Võrdsete punktide viigilahutus** sisaldab eraldi salvestusnuppu.
Üldine lüliti on vaikimisi väljas. Sisselülitamisel märgi soovitud reeglid ja liiguta
need nooltega prioriteedijärjekorda. Kõrgem aktiivne reegel otsustab esimesena.
Seaded mõjutavad järgmist pingerea laadimist; tulemuste ümberarvutamine pole vajalik.

## Reeglid

- **Rohkem kõrgemaid kohti:** rohkem esikohti, seejärel rohkem teisi kohti jne.
- **Parem halvim koht:** parem halvim koht, siis parem eelviimane koht jne.
- **Eelistatud ülesanne:** korraldaja valitud elemendi paremad lõpp-punktid.
- **Vähem lisakaristusi:** väiksem eraldi lisatud lisakaristuste summa. Elemendi
  erandikaristusi ei loeta siin uuesti. PLUS-režiimis lahutatud ja PENALTY-režiimis
  liidetud lisakaristusi võrreldakse mõlemas režiimis väiksem-on-parem põhimõttel.
- **Muu (käsitsi):** vähemalt kahe võistkonna eelistusjärjekord ja avalik põhjendus.
  Valimata võistkonnad jäävad märgitud võistkondade taha omavahel viiki. See reegel
  ei saa ületada erinevaid kogupunkte ega kõrgema prioriteediga reeglit.

Kohtade võrdlemisel kasutatakse vaikimisi kõiki tühistamata kontrollpunkte, ka
hiljem lisatud kontrollpunkte. Vaikimisi valiku väljalülitamisel saab valida
konkreetsed elemendid. Eelistatud ülesanne valitakse eraldi.

Elemendi koht arvutatakse selle lõpp-punktide järgi: PLUS-režiimis suurem ja
PENALTY-režiimis väiksem punktisumma on parem. Võrdsed elemendipunktid annavad sama
koha (1, 1, 3). Elemendi toorandmeid ega elemendi enda toortulemuse viigilahutajaid
kogupingerea reeglitesse ei lisata.

## Piirid ja jagatud kohad

Kõigepealt võrreldakse kogupunkte olemasoleva kolme komakoha täpsusega. Viigilahutus
rakendub ainult võrdse kogusummaga võistkondadele. Katkestanud ja arvestusvälised
võistkonnad ei osale üld- ega klassikohtade viigilahutuses ega nende elementide
võrdluskohtade arvutuses.

Üldarvestuse elemendikohad arvutatakse kõigi arvestuses olevate võistkondade vahel;
klassiarvestuse kohad ainult sama klassi sees. Seetõttu võib klassisisene
viigilahutuse järjestus erineda üldarvestuse järjestusest.

Kui ükski aktiivne reegel viiki ei lahenda või üldlüliti on väljas, antakse jagatud
koht (1, 1, 3). Võistkonna tähis määrab ainult võrdsete ridade kuvamise järjekorra,
mitte paremat sportlikku kohta. Kui võrreldavas kogupunktide viigigrupis puudub
mõnel võistkonnal reegli jaoks vajalik tulemus, jäetakse see reegel kogu grupis
vahele. Puuduvat tulemust ei käsitleta nullpunktide ega automaatse võiduna.
Tühistatud või kustutatud eelistatud ülesande reegel jäetakse samuti vahele.

## Kuvamine ja õigused

Põhjendus kuvatakse üld- ja klassiarvestuse kohta eraldi pingereas, mobiilikaardi
avamisel, prindiprotokollis, CSV/Exceli ekspordis ja analüüsis. Võistlejavaates
kuvatakse arvulised põhjendused ainult siis, kui täpsed punktid ja koht on lubatud;
varjatud või vahemikuna näidatavaid punkte põhjendusega ei avaldata. Simulaator
kasutab samuti valitud reegleid, kuid ei muuda ametlikke tulemusi.

Seadeid saab lugeda ja muuta võistluse haldamise õigusega kasutaja. Salvestamisel
kontrollitakse, et viidatud elemendid ja võistkonnad kuuluvad samale võistlusele.
Muudatus läbib olemasoleva turvalogi ja päringupiirangu.

Võistluse kopeerimisel säilib reeglite järjekord ning elementide viited teisendatakse
koopia elementideks. Käsitsi määratud järjekorda ja põhjendust ei kopeerita ning
käsitsi reegel lülitatakse koopias välja. Ilma elementideta koopias lülitatakse
välja ka eelistatud ülesande reegel.

Kasutuselevõtuks on lisatud migratsioon `20260919120000_competition_tie_break`.
Olemasolevatel võistlustel on viigilahutus esialgu välja lülitatud. Võrdsete
kogupunktide korral kuvatakse neil pärast uuendust jagatud kohad.
