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

## Vorm ja koosseis

Korraldaja määrab vormiehitajas, milliseid välju näidatakse registreerimisel
ja mandaadis ning kas need on kohustuslikud. „Võistkonna liikmete loend” väljal
saab määrata liikmete minimaalse ja maksimaalse arvu. Sama arv mõlemas väljas
tähendab kohustuslikus etapis täpset koosseisu. Miinimum kehtib etapis, kus
liikmete väli on kohustuslik. Vabatahtlikus etapis võib välja jätta tühjaks või
lisada ka miinimumist vähem teadaolevaid liikmeid; maksimum kehtib alati.

Kui võistluse koosseisunõuetes on esindaja kohustuslik, lisab süsteem vormi
automaatselt esindaja nime, e-posti ja telefoni. Nimi ja e-post eeltäidetakse
sisselogitud kasutaja konto andmetega. Süsteemseid esindajavälju ei saa
vormiehitajas eemaldada.

## Esindaja vaade

Esindaja näeb dashboard'il jaotist **Minu esindatavad võistkonnad**. Sealt
avaneb ainult talle määratud võistkonna registreerimise ja mandaadi vorm.

Esindaja:

- ei saa kasutada võistluse üldist haldus-API-t;
- ei saa muuta teisi sama võistluse võistkondi;
- ei saa muuta esitatud või kinnitatud etappi;
- ei saa muuta registreerimist pärast võistluse aktiveerimist.

## Avalik nimekiri

Avaliku võistluse lehel näevad ka sisselogimata külastajad aktiivselt esitatud
registreeringuid kolmes rühmas: võistlusele pääsenud, ootenimekirjas ja
korraldaja otsust ootavad võistkonnad. Avalikus nimekirjas kuvatakse ainult
võistkonna nimi, klass, staatus ja ootenimekirja koht. Liikmete, esindaja ning
kontaktisikute andmeid ei avaldata. Mustandeid, tagasi lükatud registreeringuid
ja loobunud võistkondi avalikus nimekirjas ei näidata.

## Korraldaja vaade

Võistluse lehel on jaotis **Registreerimine**, kus omanik, korraldaja või
süsteemiadministraator näeb kõigi võistkondade olekuid, esindajat ja mandaadi
koosseisu. Esitatud etapi saab kinnitada või märkusega parandamisele saata.

Avaliku registreerimise kinnitamisel seotakse registreeringu esitanud kasutaja
võistkonna esindajaks. Korraldaja saab esindajat hiljem võistluse
**Juurdepääsu** lehel muuta. Kui esindajal veel kontot ei ole, saab talle samalt
lehelt luua rollikutse ja edastada kuvatud lingi käsitsi.

## Isikuandmed

Vorm võib koguda liikmete e-posti, telefoni ja sünniaega. Korraldaja määrab
võistluse seadetes nende säilitustähtaja vahemikus 1–90 päeva pärast võistluse
lõppu. Tähtaja saabumisel eemaldatakse kontakt- ja sünniandmed, kuid tulemuste
ajaloo jaoks säilivad võistkonna nimi, liikmete nimed ja rollid.

Automaatse kustutamise käivitamine on kirjeldatud failis
[personal-data-retention.md](personal-data-retention.md).
