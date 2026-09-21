# Punktidega valikud ja ajatabel

Elemendi lisamisel või muutmisel saab sisendvälja tüübiks valida **Valik punktidega** või **Aeg → punktitabel**. Need töötavad ka kombineeritud hindamise osades.

- Valikule määra nimetus ja punktid. Kohtunik valib vastuse rippmenüüst; vastuse tunnus säilib ja arvutuses kasutatakse punkte.
- Ajatabelis sisesta kasvavas järjekorras iga vahemiku viimane sekund (`m:ss`) ja punktid. Esimene vahemik algab 0:00, järgmine eelmisele piirile järgnevast sekundist. Määra eraldi punktid pärast viimast ajapiiri.
- Valemis tähistab valiku- või ajavälja nimi selle eest saadud punkte. Tavalisest arvuväljast saab arvutada näiteks `sedelid * 2`.
- Märkeruut **Võrdsete ülesandepunktide korral on lühem aeg parem** järjestab sama ülesandeskooriga võistkonnad sisestatud aja järgi. Absoluutsete punktide korral see punkte ei muuda. Pingerea järgi punkte jagavates meetodites kasutatakse ajaga lahendatud kohta ka ülesande punktide arvutamiseks. Võistluse üld- ja klassipingereale eraldi ajapõhist viigilahutust ei lisata. Sama aeg jätab koha jagatuks. Kui viigiaegu on mitu, võrreldakse neid väljade järjekorras; puuduv aeg jääb sisestatud aja taha.

## Näide: NATO ülesanne

Tühja või ühe väljaga elemendi juures nupp **Kasuta NATO ülesande näidist (40 p)** seadistab:

1. NATO tähestik: kasutab 2 p, osaliselt 1 p, ei kasuta 0 p.
2. Õigesti avatud sedelid: 0–9, igaüks 2 p.
3. Lahendussõna: leidis 5 p, ei leidnud 0 p.
4. Aeg: kuni 4:15 (sh alla 4 minuti) 15 p; iga järgmine 16-sekundiline vahemik ühe punkti võrra vähem; 7:44–7:59 1 p; alates 8:00 0 p.
5. Arvutatud tulemus: `nato + sedelid * 2 + lahendus + aeg`.

Valikud ja tabel on muudetavad. Näidis kasutab absoluutseid punkte, maksimaalne tulemus on 40. Kohtunik sisestab neli vastust; kokku arvutatakse automaatselt. Väljade muutmisel arvutatakse olemasolevad tulemused uuesti.

## Salvestamine

Andmebaasi migratsiooni pole vaja. `FieldDefinition.type` uued väärtused on `POINTS_SELECT` ja `TIME_POINTS`. Valikud, ajapiirid, ülempiiri punktid ja viigilahutuse lüliti salvestatakse `meta` JSON-i. `Result.values` sisaldab valiku stabiilset tunnust või algset kestust; `computeFields` teisendab need punktideks. CSV/Exceli import aktsepteerib valiku tunnust või täpset nimetust, aja puhul `m:ss` / `h:mm:ss`.
