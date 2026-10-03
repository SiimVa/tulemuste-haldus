# Statistika töölaud, kaart ja pingerea külmutamine

Statistika vaade on menüüs **Tulemused → Statistika**
(`/dashboard/competitions/<id>/overview`). See koosneb vidinatest, mille
korraldaja valib lehel **Kohanda vaadet**. Iga vidina kohta saab eraldi valida,
kas see on töölaual, avalikus vaates (`/public/<id>/dashboard`) või mõlemas.
Järjekord on mõlemas vaates sama.

## Vidinad

| Vidin | Mida näitab | Avalik? |
| --- | --- | --- |
| Põhinumbrid | keskmiselt läbitud KP-d, läbimise ja tulemuste %, võistkondade seis | lubatud |
| Kaart | KP-d mullidena: suurus = läbinud võistkonnad, värv = tulemus, värskus või läbimised | lubatud, vt allpool |
| KP-de värskus | iga KP viimane sisestus, möödunud aeg, kollane/punane lävi | ainult korraldajale |
| Võistkondade asukoht | viimane KP, järgmine KP, ohutushoiatus | ainult korraldajale |
| Puuduvad tulemused | vahele jäänud või sisestamata KP-d | ainult korraldajale |
| Kohtunike aktiivsus | sisestajate viimane tegevus, vaikivad KP-d | ainult korraldajale |
| Katkestamised ja staatused | katkestanud, mittestartinud, diskvalifitseeritud, arvestusvälised, katkestanud liikmed | ainult korraldajale |
| Sisestamise tempo | tulemused ajas ja prognoos, millal kõik on sees | lubatud |
| Edenemine elementide kaupa | sisestatud / oodatud tulemused | lubatud |
| Parimad võistkonnad | top N üld ja klassiti, vahe eelmise ja esimesega | lubatud |
| Õiglane vahepingerida | ühiste KP-de summa ja keskmine läbitud KP kohta | lubatud |
| Tihedad heitlused | poodiumikohad, mille vahe on alla piiri | lubatud |
| KP võitjad | iga KP parim üld ja klassiti | lubatud |
| KP tabel | sooritanud, ebaõnnestunud, erandid liigiti, andmete täielikkus | lubatud |
| Raskusaste | keskmine kaotus parimast (% maksimumist), ebaõnnestunud ja sooritamata % | lubatud |
| Eristusvõime | punktide hajuvus ja Spearmani seos ülejäänud tulemusega | lubatud |
| Klasside võrdlus | klasside keskmine KP kaupa | lubatud |
| Ajakulu KP-s | kestus ajavahemiku või aja väljast, samaaegsed võistkonnad | lubatud |
| Karistused | vastutegevus, varustus, hilinemine, käsitsi karistused | ainult korraldajale |

„Ainult korraldajale” vidinad sisaldavad isikuandmeid (nt katkestanud liikmete
nimed) või sisekorralduslikku infot. Neid ei saa avalikuks märkida ka
API kaudu. Avaliku vaate vaikimisi sisu on sama mis enne vidinaid: põhinumbrid
ja edenemine elementide kaupa.

Eelseaded „Võistluse ajal”, „Avalik ekraan” ja „Kokkuvõte” valivad sobivad
vidinad ja tõstavad need ettepoole. Lävendid (värskus, ohutus, top N, tiheda
heitluse piir, ekraani vahetus) on samal lehel.

## Võistkondade liikumine

Asukoht ja „viimati nähtud” põhinevad tulemuse **sisestamise ajal**, mitte
saabumisajal. Kui kohtunik sisestab tulemused hiljem, on asukoht vastavalt
vanem. Tulemus erandiga „Ei läbinud” ei ole KP-s käimine.

KP-de läbimise järjekord on vaikimisi elementide järjekord. Klassiti saab valida
vastupidise, oma (KP-de tähised järjekorras) või vaba järjekorra. Järjekorra
järgi leitakse järgmine KP ja vahele jäänud KP-d. Lõpetanuks loetakse
võistkond, kelle tulemus on finišis (seadetes valitud element või järjestatud
raja viimane KP). Vaba järjekorra korral vali finiš, muidu ei loeta kedagi
lõpetanuks ja ohutushoiatus jääb sisse kuni võistluse lõpuni.

Ohutushoiatus tekib ainult siis, kui võistlus on staatuses „Toimub”:
rajal olevat võistkonda pole määratud minutite jooksul nähtud või võistkonda
pole nähtud ühestki KP-st, kuigi esimesest sisestusest on see aeg möödas.

## Erandite liik

Erandil on liik: **Ei läbinud**, **Läbis, aga ei sooritanud**,
**Ebaõnnestus** või **Muu erand**. KP tabel, raskusaste ja asukoht kasutavad
liiki, mitte nime. Ebaõnnestunud võistkond käis KP-s. Vanematel eranditel liik
puudub ja see tuletatakse nimest („Ei läbinud…”, „Läbis aga ei sooritanud…” ja
„Ebaõnnestu…”). Liiki saab muuta elemendi loomise ja muutmise vormis. Liik
„Ebaõnnestus” mõjutab ka punkte, vt [exceptions.md](exceptions.md).

## Kaart

Kaardi leht on menüüs **Tulemused → Kaart**. Võimalused:

1. **Kaardipilt.** PNG, JPEG või WebP kuni 10 MB. Tüüp ja mõõdud loetakse
   failist, SVG-d ei lubata. Pilt on andmebaasis (`CompetitionMap`), eraldi
   tabelis, et võistluse päringud seda kaasa ei loeks.
2. **KP märkimine kaardile.** Vali KP, klõpsa kaardil; märgitud KP-d saab
   lohistada. Asukoht salvestub suhtelisena (0–1), seega sama kaardi suurem või
   väiksem versioon sobib.
3. **MGRS-koordinaadid.** Sisesta KP juurde või lae alla Exceli mall
   (Tähis, Nimi, Tüüp, MGRS), täida see ja impordi. Read tüübiga „Märk”
   lisavad märgid (nt Start KT). Import õnnestub ainult tervikuna.
4. **Sidumine.** Kui vähemalt kaks KP-d on nii kaardile märgitud kui ka
   koordinaadiga, seotakse kaart koordinaatidega (sarnasusteisendus) ja ülejäänud
   koordinaadiga KP-d paigutatakse automaatselt. Lehel on näha keskmine
   erinevus ja üle 30 m erinevad punktid (tavaliselt trükiviga koordinaadis).
5. **Ilma kaardipildita** näidatakse koordinaadiga KP-sid skeemina, põhi
   üleval, ruudustiku ja mõõtkavaga.

**Avalik kaart näitab KP-de asukohti.** Seepärast on avalik kaart ja selle pilt
(`/api/public/competitions/<id>/map-image`) vaikimisi nähtav alles siis, kui
võistlus on lõppenud. Võistluse ajal avaldamiseks tuleb seadetes eraldi märkida
„Näita avalikku kaarti ka enne võistluse lõppu”. Avalikus kaardis ei ole
võistkondade asukohti.

## Ekraanirežiim

- `/screen/<id>`: korraldaja vidinad peakorteri ekraanile, sisselogimisega.
- `/public/<id>/screen`: avalikud vidinad finišiala ekraanile.

Vidinad vahetuvad seadetes määratud aja järel, andmed uuenevad iga 30 sekundi
järel. Nooled vahetavad vidinat ja tühik peatab vahetamise.

## Pingerea külmutamine

Seade on lehel **Vaated → Avalik vaade**. Korraldaja võib külmutada kohe või
määrata kellaaja. Külmutamise hetkel salvestatakse snapshot: arvutatud punktid,
käsitsi karistused, Muu/Katkestamise kirjed ning võistkondade ja elementide
staatused (`LeaderboardFreeze`).

Külmutuse ajal:

- avalik pingerida ja pingerea API näitavad snapshot'i seisu (korraldajale API
  jooksvat seisu);
- avalik ülevaade ja ekraan arvutavad tulemusvidinad snapshot'ist ning loendavad
  ainult enne külmutamist sisestatud tulemusi;
- analüüs, analüüsi link ja simulaator on suletud;
- võistlejate ja esindajate vaates on punktid, kogusumma ja koht peidetud.

Korraldaja näeb kõikjal jooksvat seisu ja teadet külmutuse kohta. **Avalikusta
tulemused** kustutab külmutuse ja avalikud vaated uuenevad kohe. Ajastatud
külmutuse snapshot tehakse esimese avaliku päringu ajal või hiljemalt
5-minutilise cron-i (`/api/internal/notifications/deliver`) käivitusel. Kui
vahepeal keegi avalikku vaadet ei avanud, võivad snapshot'i jõuda ka mõne
minuti jooksul pärast määratud aega sisestatud tulemused.

## Kopeerimine ja kasutuselevõtt

Võistluse kopeerimisel koos elementidega tulevad kaasa töölaua seaded (KP-viited
seotakse uute elementidega), elementide asukohad, kaardipilt ja märgid. Külmutust
ei kopeerita.

Railway deploy rakendab migratsiooni `20261003120000_statistics_dashboard`. Uusi
keskkonnamuutujaid ega Railway teenuseid pole vaja.
