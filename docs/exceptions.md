# Erandid ja ebaõnnestumine

Erandeid muudetakse elemendi kaupa: **Elemendid → element → Muuda → Erandid**.
Igal erandil on nimi, karistus ja liik. Võistluse seadetes on ainult vaikimisi
karistused, mida kasutatakse uue KP loomisel ja nupuga „Rakenda kõigile”.

## Liigid

| Liik | Tähendus | Hindamine |
|---|---|---|
| Ei läbinud | võistkond ei jõudnud KP-sse | kindel karistus, pingereast väljas |
| Läbis, aga ei sooritanud | käis KP-s, kuid ülesannet ei teinud | kindel karistus, pingereast väljas |
| Ebaõnnestus | tegi ülesande, kuid mitte kriteeriumite järgi | pingereas viimane koht |
| Muu erand | muu põhjus | kindel karistus, pingereast väljas |

Hindamine ja statistika kasutavad liiki, mitte nime. Vanematel eranditel liik
puudub ja see tuletatakse nimest: „Ei läbinud…”, „Läbis aga ei sooritanud…” ja
„Ebaõnnestu…”.

## Ebaõnnestus

Pingereaga meetodites jäävad ebaõnnestunud võistkonnad pingerea viimasele
kohale ja saavad halvima tulemuse. Kõik ebaõnnestunud jagavad viimast kohta.
Õnnestunud võistkonnad paigutatakse nende ette, seega paraneb ka õnnestunute
halvim tulemus.

Näide: pingerida valemiga, maksimum 30, miinimum 0, 10 võistkonda, neist 3
ebaõnnestus. Õnnestunud saavad 30; 26,667; 23,333; 20; 16,667; 13,333 ja 10
punkti, ebaõnnestunud 0 punkti. Kui need kolm oleksid tavalised erandid, saaks
viimane õnnestunu 0 punkti.

| Meetod | Ebaõnnestunu tulemus |
|---|---|
| Pingerida valemiga | miinimumpunktid (karistuspunktides maksimum); kohti on õnnestunud + ebaõnnestunud |
| Fikseeritud pingerida | viimase koha punktid tabeli või valemi järgi; käsitsi režiimis tabeli viimane väärtus |
| Registreerunute arvu järgi | arvestusgrupi viimase koha punktid |
| Väärtusepõhine | halvim võimalik tulemus |
| Ilma pingereata (absoluutsed jt) | erandi karistus nagu teistel eranditel |
| Kombineeritud element | igas pingereaga osas viimane koht, muus osas halvim võimalik tulemus |

„Ebaõnnestus” erandi karistust kasutatakse ainult ilma pingereata hindamisel.
Vaikimisi on see punktisüsteemis 0 ja karistuspunktides KP maksimum.
Pingereaga ja kombineeritud elemendis tähendab ebaõnnestumine viimast kohta.

### Tulemus jääb alles

Ebaõnnestunud võistkonnal on sooritus olemas, seega sisestatakse tulemus nagu
tavaliselt. Ebaõnnestumise otsus tehakse automaatse tingimuse või kohtuniku
valiku järgi. Väljad jäävad
korraldaja tabelis ja kohtuniku vormis nähtavaks. Kohustuslikke välju ei nõuta,
sest katkenud soorituse puhul võib mõni väärtus puududa. Tulemus on näha koos
märkega:

- elemendi tulemuste tabelis ja kohtuniku vaates;
- Exceli ja CSV ekspordis ning prinditavates tulemustes;
- võistleja tulemustes ja avalikus analüüsis.

Exceli impordis loetakse ebaõnnestunud rea väärtused samuti sisse.

Sisestatud tulemus punkte ei mõjuta: ebaõnnestunud jagavad viimast kohta ka
siis, kui nende tulemus oleks parem, ja nende aeg viiki ei lahenda. Teiste
erandite valimisel väärtusi ei salvestata.

Arvestusvälised võistkonnad ei muuda arvestuses olevate võistkondade kohti.
Arvestusväline ebaõnnestunu saab viimase koha punktid kõigi võistkondade
pingereas. Elemendi lehe **Arvutuste ülevaade** näitab iga võistkonna kohta,
mitu ebaõnnestunut oli pingerea lõpus.

## Automaatne tingimus ja kohtuniku otsus

KP loomisel või muutmisel saab jaotises **Automaatne ebaõnnestumine** valida
välja, võrdluse ja piirväärtuse. Võrdlused on `=`, `≠`, `<`, `≤`, `>` ja `≥`.
Mitme tingimuse korral valitakse **Kõik tingimused** või **Vähemalt üks tingimus**.
KP erandite hulgas peab olema erand liigiga „Ebaõnnestus”.

Näiteks meditsiini KP tingimus võib olla „Õigeid triaažikaarte < 3”.
Puhta looduse KP-s võib kasutada korraga „Korjatud esemeid < 5” ja
„Õigesti sorteeritud esemeid = 0”, ühendades need valikuga „Kõik tingimused”.

Tingimus saab kasutada sisendvälju või arvutatud välju. Valikväljadest
kasutatakse vastuse punkte, ajaväljadest sekundeid ja ajapunktide väljadest
punkte. Hindamisest saadud lõpp-punkte tingimuses ei kasutata.
Kui asjaolu pole veel väljadega kirjeldatud, saab lisada jah/ei valikvälja,
kus „Jah” annab 1 ja „Ei” 0; näiteks „Muna terve ja kõvaks keedetud”.

Kohtuniku vormis, korraldaja tabelis ja hulksisestuses on kolm valikut:

- **Automaatne**: hinnang koos põhjusega arvutatakse sisestatud väärtustest.
- **Ei ebaõnnestunud**: kohtuniku otsus tühistab automaatse ebaõnnestumise.
- **Ebaõnnestus**: kohtunik märgib ebaõnnestumise ka hea tulemuse korral,
  näiteks ohutusnõuete rikkumise tõttu.

Käsitsi otsus säilib tulemuse parandamisel ja vormi taasavamisel.
„Automaatne” taastab tingimuse järgi hindamise. Ilma tingimuseta ei märgita
sooritust automaatselt ebaõnnestunuks. Muud eriolukorrad, näiteks „Ei läbinud”,
määravad tulemuse senisel viisil.

Tühi väli pole null. Kui automaatseks kontrolliks puudub vajalik väärtus,
näitab vorm puuduvat välja ja salvestamiseks tuleb andmed täita või teha
käsitsi otsus. Arvutatud välja puuduv lähteväärtus või vigane valem ei muutu
nulliks. Täiesti tühi sisestus kustutab tulemuse; käsitsi „Ebaõnnestus” saab
salvestada ka ilma väljaväärtusteta.

Tingimuse muutmisel hinnatakse automaatsed tulemused uuesti ja arvutatakse
punktid samas tehingus. Käsitsi otsuseid ei muudeta. Kui uue tingimuse jaoks
puuduvad olemasolevas automaatses tulemuses andmed, tuleb esmalt tulemus
parandada või määrata käsitsi otsus. Tingimuses kasutatava välja või
hindamisosa eemaldamiseks tuleb tingimus esmalt parandada või eemaldada.

### Import

Impordi eelvaade näitab automaatset otsust ja põhjust. Mallis on valikuline
veerg **Ebaõnnestumise otsus**, kuhu võib kirjutada „Automaatne”,
„Ei ebaõnnestunud” või „Ebaõnnestus” (ka `AUTO`, `FORCE_SUCCESS`, `FORCE_FAILED`).
Tühi otsus säilitab olemasoleva käsitsi valiku; uuel tulemusel kasutatakse
automaatrežiimi. „Erand” veerus nimetatud ebaõnnestumise erand tähendab
käsitsi ebaõnnestumist, kui otsuse veerus pole teistsugust valikut.
Puuduvate automaatse kontrolli andmetega rida kuvatakse veana.

Andmemudelis paikneb tingimus elemendi `config.failureRule` seadistuses
ja valik tulemuse `failureMode` väljas. Lõplik hinnang salvestatakse endiselt
olemasoleva ebaõnnestumise erandina; punktiarvestuse reeglid ei muutu.
Migratsioon säilitab varasemad ebaõnnestumised käsitsi otsustena.

## Uued ja olemasolevad kontrollpunktid

Uuel KP-l on vaikimisi kolm erandit: „Ei läbinud”, „Läbis aga ei sooritanud” ja
„Ebaõnnestus”.

**Seaded → Rakenda kõigile** lisab erandi „Ebaõnnestus” igale KP-le, kus seda
pole, ja seab selle karistuse vaikeväärtusele. Kui KP-l on juba samanimeline
erand teise liigiga (näiteks loodud enne liigi „Ebaõnnestus” lisandumist), saab
see liigi „Ebaõnnestus”. Uut korduvat erandit ei lisata.

Elemendi erandite salvestamisel arvutatakse elemendi punktid ümber. Teiste
elementide salvestatud punktid muutuvad alles järgmisel ümberarvutusel. See
kehtib ka vanema liigita erandi kohta, mille nimi algab sõnaga „Ebaõnnestu”.

## Statistika

KP tabelis on veerg „Ebaõnnestus”. Ebaõnnestunud võistkonnad loetakse KP-s
käinuteks. Raskusaste näitab ebaõnnestunute osakaalu eraldi sooritamata
tulemustest. Ajakulu KP-s arvestab ka ebaõnnestunute aega. Avaliku analüüsi
parima, keskmise ja halvima tulemuse arvutusse ebaõnnestunud ei lähe.
