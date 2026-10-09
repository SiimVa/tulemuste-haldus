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

Esindaja näeb töölaual jaotist **Minu võistkonnad**. Sealt
avaneb ainult talle määratud võistkonna registreerimise ja mandaadi vorm.

Esindaja:

- ei saa kasutada võistluse üldist haldus-API-t;
- ei saa muuta teisi sama võistluse võistkondi;
- ei saa muuta esitatud või kinnitatud etappi;
- ei saa muuta registreerimist pärast võistluse aktiveerimist.

## Avalik nimekiri

Võistluse registreerimise seadetes saab valida kolm ligipääsurežiimi:

- **Avalik** – võistlus on avalikus võistluste nimekirjas ja selle
  registreerimisleht avaneb kõigile;
- **Ainult lingiga** – võistlust avalikus nimekirjas ei näidata, kuid eraldi
  registreerimislink avab sama lehe;
- **Privaatne** – väline registreerimisleht ei ole kättesaadav.

Lingiga registreerimiseks loodud 256-bitist juhutunnust näidatakse korraldajale
ainult selle loomisel. Andmebaasis säilitatakse tunnuse SHA-256 räsi. Kui link
on kadunud või lekkinud, saab korraldaja luua uue lingi; vana link muutub kohe
kehtetuks. Registreerimisavalduse esitamiseks peab kasutaja igas režiimis sisse
logima.

Ligipääsetaval registreerimislehel näevad ka sisselogimata külastajad aktiivselt
esitatud registreeringuid kolmes rühmas: võistlusele pääsenud, ootenimekirjas ja
korraldaja otsust ootavad võistkonnad. Registreerimislehe nimekirjas kuvatakse
ainult võistkonna nimi, klass, staatus ja ootenimekirja koht. Liikmete, esindaja
ning kontaktisikute andmeid ei avaldata. Mustandeid, tagasi lükatud
registreeringuid ja loobunud võistkondi nimekirjas ei näidata.

## Esindaja töölaud

Töölaua registreeringukaart ja registreeringu teavitus avavad sisselogitud
esitajale tema enda avalduse lehe. Ligipääs oma avaldusele säilib ka ainult
lingiga või privaatse võistluse puhul ning registreerimislingi vahetamisel.
Leht ei ava teiste esitajate avaldusi ega võimalda ilma registreerimislingita
uusi võistkondi lisada. Tagasi saadetud avaldust saab täiendada ka pärast
registreerimise sulgemist, kuni osalejate nimekiri pole lõplikult kinnitatud.

Töölaua **Minu võistkonnad** vaade näitab registreeritud ja esindatud võistkondi
ning kontoga seotud liikme enda võistkonda. Võistkond püsib nähtav ka etappide
vahel. Avalduse ja sellest loodud võistkonna seos võetakse `teamId` järgi, et
sama võistkonda ei kuvataks topelt.

- **Registreerimised:** mustand, registreeritud, registreerimine kinnitatud,
  ootenimekirjas või vajab täiendamist. Kinnitatud võistkond püsib siin ka pärast
  osalejate nimekirja kinnitamist, kuni mandaat avaneb. Kaardil on järgmine samm
  ja võimalusel mandaadi avanemise aeg.
- **Mandaadid:** ootab mandaadi esitamist, mandaat esitatud, vajab täiendamist
  või mandaat kinnitatud. Kinnitatud mandaat jääb nähtavaks kuni võistluse
  alguseni, ka pärast mandaadietapi lõplikku kinnitamist.
- **Käimasolevad võistlused:** võistluse aktiveerimisel liigub kinnitatud
  võistkond siia. Esindaja ja kontoga seotud liige saavad avada enda tulemused
  ja kopeerida tulemuste lingi.

Vaates saab filtreerida etapi järgi, otsida võistkonna või võistluse nime järgi
ning kuvada ainult enda tegevust vajavad kirjed. Mandaadikaart avab kohe
mandaadi jaotise. Ainult esindaja saab avada võistkonna muutmise vormi; liige
näeb enne võistluse algust olekut. Endisel avalduse esitajal säilib juurdepääs
enda registreeringule ka siis, kui korraldaja on esindaja vahetanud.

Töölaua ülejäänud valikud on **Hindamine**, **Võistluste haldamine** ja
**Leia võistlus**. Need eristavad kohtuniku, korraldaja ja osaleja tegevused.
Vaikimisi avaneb enda võistkondade vaade, kui neid leidub; muidu enda
hindamispunktid või hallatavad võistlused. Põhimenüüs on töölaud, avalikud
võistlused, teavitused ning administraatori tööriistad ka mobiilis.

## Korraldaja vaade

Võistluse lehel on jaotis **Registreerimine**, kus omanik, korraldaja või
süsteemiadministraator näeb kõigi võistkondade olekuid, esindajat ja mandaadi
koosseisu. Esitatud etapi saab kinnitada või märkusega parandamisele saata.

Nupp **Muuda võistkonda** avab korraldajale võistkonna nime, klassi ja vormi
vastused, sealhulgas esindaja kontaktandmed ja liikmed. Muudatused saab otse
salvestada ka pärast registreerimise tähtaega ning mandaadi ajal. Salvestamine
ei muuda avalduse ega mandaadi kinnitamise staatust. **Muuda esindajat** määrab nime ja e-posti järgi uue esindaja. Olemasoleva
konto nimi ja e-post on määravad; kontota inimese määrang ootab sama e-postiga
sisselogimist või administraatori loodud kontot. Vahetamisel tuleb uue esindaja
telefon uuesti sisestada. Nime ja e-posti eraldi vormivastustena muuta ei saa.
Esindajat saab määrata ka **Juurdepääsu** lehel; seal tehtud vahetus tühjendab
vana esindaja telefoninumbri.

**Lisa võistkond** loob enne osalejate nimekirja kinnitamist korraldaja esitatud
kinnitatud avalduse. Avatud automaatse registreerimise korral rakendub sellele
ka tavapärane kohtade jaotus. Pärast nimekirja kinnitamist luuakse kohe kinnitatud
registreerimisega võistkond, mille mandaat on mustand. Hiljem lisatud võistkonnale
saab esindaja määrata **Juurdepääsu** lehel.

### Osalejate nimekirja kinnitamine

**Kinnita osalejate nimekiri** kontrollib enne kõiki kinnitatud avaldusi ja
näitab kõik leitud probleemid korraga:

- mis kinnitamist takistab (registreerimine on avatud, ootel avaldused koos
  võistkondade nimedega);
- liikmete e-posti kordused: sama e-post mitmel liikmel ühes avalduses, teises
  varem esitatud avalduses või olemasoleva võistkonna liikmel.

Liikme e-post seob ta kasutajakontoga, seega võib üks e-post olla võistlusel
ainult ühel liikmel. Iga probleemse avalduse juures saab avada **Muuda
osalejaid** või avalduse **tagasi lükata**; ülevaatus uueneb kohe. **Kinnita
nii** kinnitab nimekirja nii, et e-post jääb esimesele liikmele (olemasoleva
võistkonna liikmele, varem esitatud avaldusele, avalduses esimesena kirjas
olevale liikmele). Teisi liikmeid kontoga ei seota; nende e-post jääb avalduse
andmetesse ja eksporti. Kui avaldused vahepeal muutuvad, näidatakse uut
ülevaatust ega kinnitata vana nõusoleku põhjal.

Pärast nimekirja kinnitamist muudab nupp võistkonna praeguseid andmeid ja
mandaadi koosseisu; registreerimisavalduse varasemad vastused säilivad
registreerimise aruande jaoks. Korraldaja muudatused salvestatakse auditisse.
Esindaja enda tähtaja- ja muutmispiirangud jäävad kehtima.

Menüüs **Registreerimine → Registreerimise ülevaade** saab valida registreerimise
või mandaadi andmed, kuvatavad põhiandmed ja vormiväljad. Otsing ning klassi- ja
staatusfilter piiravad tabeli ridu. **Ekspordi Excel** ja **Ekspordi CSV** kasutavad
samu veerge ja filtreid. Veeruvalik säilib brauseris võistluse ja etapi kaupa.
Lehel **Registreerimised** saab mõlema etapi kõik andmed ka otse eksportida.

Ülevaates on vaikimisi sisse lülitatud **Koonda samad vastused**. Valitud
veergudes täpselt samade väärtustega read liidetakse ning lisatakse
**Võistkondade arv**. Näiteks ainult maakonna valimisel kuvatakse iga maakond
üks kord koos sealt registreerunud võistkondade arvuga; maakonna ja klassi
valimisel loendatakse iga maakonna-klassi kombinatsiooni eraldi. Filtrid
rakenduvad enne loendamist ning Exceli ja CSV eksport sisaldab sama kokkuvõtet.
Koondamise väljalülitamisel näeb ja ekspordib taas iga võistkonna eraldi real.

Rippmenüüst **Koonda välja järgi → Maakond** saab ühe valikuga avada maakondade
kokkuvõtte. Koondamise väljad salvestatakse võistkondade loendi veergudest eraldi,
nii et loendi nimed ja kontaktandmed ei jaga kokkuvõtet üksikuteks võistkondadeks.
Esimesel avamisel koondatakse klassi järgi. **Filtreeri vormivastuseid** võimaldab
valida näiteks ühe maakonna või puuduva vastuse. Mitme välja filtrid kehtivad
korraga, ka peidetud veergude puhul. Excel ja CSV järgivad neid filtreid nii
kokkuvõttes kui ka võistkondade loendis. Etapi vahetamisel vastusefiltrid tühjendatakse.

Registreerimise aruanne kasutab avalduse vastuseid; mandaadi aruanne võistkonna
praeguseid vastuseid ja koosseisu. **Esindaja nimi, e-post ja telefon näitavad
mõlemas aruandes praegust esindajat**, nagu registreerimiskaart ja muutmisvorm.
Registreerimiskaardil on algne registreerija eraldi real „Registreeris”. Varasemad avalduseta võistkonnad on samuti
kaasatud, kuid avaldusest loodud võistkonda registreerimisel topelt ei loeta.
Kõik staatused, sh mustandid ja loobumised, on vaikimisi kaasatud. Eksport on
kättesaadav ainult võistluse haldusõigusega kasutajale. Kustutatud isikuandmeid
aruandes ei taastata.

Avalikul registreerimisel on registreerija alguses ka esindaja. Edaspidi on
algne registreerija (`submittedById`) ja avalduse praegune esindaja
(`representativeId` või ootel e-post) eraldi. Esindaja vahetamine ei kirjuta
registreerijat üle. Algne registreerija saab enda avaldust vaadata, kuid pärast
vahetust saab seda muuta ja registreeringust loobuda ainult praegune esindaja.
Osalejate nimekirja kinnitamisel kantakse praegune esindaja üle võistkonnale.

Kõik esindaja määramise viisid uuendavad sama seost ja praeguseid kontaktandmeid.
Uuele esindajale saadetakse teavitus; kontota saaja saab e-kirja juhisega sama
e-postiga sisse logida. Ka staatusteated ja korraldaja kirjade saajaloend kasutavad
praegust esindajat. Vana esindaja saatmata töövooteated tühistatakse.

**Juurdepääsu** lehe rollikutse annab õigused vastuvõtmisel. Hilisem esindaja
määramine eemaldab selle võistkonna teistele esindajatele saadetud ootel kutsetest;
esindaja eemaldamine tühistab selle võistkonna määrangu kõigis ootel kutsetes.
Kutse teiste võistkondade ja rollide õigused säilivad. Tühjaks jäänud kutse
tühistatakse. Vastuvõtmine ja õiguste määramine toimuvad ühes tehingus.

Esindajavahetus kajastub seotud avalduse sündmuste ajaloos; varasemate sündmuste
tegijaid ei muudeta. Vana muutmisvormi salvestamine lükatakse tagasi, kui esindaja
on vahepeal muutunud.

Olemasolevate andmete migratsioon taastab algse registreerija avalduse esimese
loomissündmuse tegija järgi. Puuduva loomissündmuse korral säilib olemasolev
esitaja; puuduvat ajalugu ei oletata.

## Isikuandmed

Vorm võib koguda liikmete e-posti, telefoni ja sünniaega. Korraldaja määrab
võistluse seadetes nende säilitustähtaja vahemikus 1–90 päeva pärast võistluse
lõppu. Tähtaja saabumisel eemaldatakse kontakt- ja sünniandmed, kuid tulemuste
ajaloo jaoks säilivad võistkonna nimi, liikmete nimed ja rollid.

Automaatse kustutamise käivitamine on kirjeldatud failis
[personal-data-retention.md](personal-data-retention.md).

## Registreerimise prognoos

Menüüs **Registreerimine → Prognoos** näeb korraldaja kahte hinnangut aktiivsete
registreerimisavalduste arvule registreerimise tähtajal. Prognoos ei ennusta
tegelikku kohaletulekut. Mustandeid ei arvestata, korduv esitamine ei lisa uut
võistkonda. Kinnitatud, ootel ja parandamisel avaldused on aktiivsed;
loobunud ja tagasi lükatud avaldused ei ole.

- **Senine tempo:** viimase 7 täispäeva aktiivsete avalduste netokasvu kaal on
  65% ja kuni 14 täispäeva kaal 35%. Prognoos vajab vähemalt 3 päeva ajalugu,
  5 esitatud avaldust ning tulevast lõpptähtaega. Tänane poolik päev tempot ei
  mõjuta. Loobumised ja tagasilükkamised võivad anda negatiivse netotempo.
- **Ajalooline prognoos:** korraldaja valib kuni 20 enda hallatavat lõppenud
  registreerimisega võistlust. Võrdlus joondatakse päevade arvu järgi tähtajani.
  Iga võrdluse hinnang on praegune aktiivsete arv × võrdlusvõistluse aktiivsete
  arv tähtajal / selle aktiivsete arv samal ajal enne tähtaega. Kuvatakse
  sobivate võrdluste mediaan. Võrdluse vahepunktis peab olema vähemalt
  3 aktiivset avaldust. Puuduliku ajalooga võistlusi ei kasutata.

Vahemikud on stsenaariumihinnangud, mitte kalibreeritud statistilised
usaldusvahemikud. Tempohinnangu hajuvus sõltub vaatlusperioodist ja kahe
akna tempo erinevusest. Ajaloolise hinnangu vahemik lähtub võrdluste
äärmustest koos varuga (ühe võrdluse puhul 25%, mitme puhul 10%, vähemalt
2 võistkonda). Kohtade piir ei kärbi registreerimisnõudluse hinnangut;
piiriga arvestav võimalik osalejate arv kuvatakse eraldi.

Graafik ja päevakokkuvõtted kasutavad UTC kalendripäevi. Salvestatakse ainult
muutustega päevad ning perioodi piirid; nende vahel jäävad arvud samaks.
Käsitsi lisatud ja vana töövoo võistkondade puuduvat avalduse ajalugu ei
asendata võistkonna loomise kuupäevaga. Vaates näidatakse nende väljajätmist.
Puuduva sündmuste ajaloo korral näidatakse hoiatust; teadaolev lõppstaatus
kajastatakse kokkuvõtte koostamise päeval, mitte oletuslikul varasemal ajal.

Võrdlusvalik säilib brauseris võistluse kaupa. API kontrollib nii sihtvõistluse
kui iga valitud võrdlusvõistluse haldusõigust ja väljastab ainult arvulised
kokkuvõtted. Prognoos on saadaval ainult avatud registreerimise ajal;
muudel juhtudel kuvatakse ajalugu.
