# Punktidega valikud ja ajatabel

Elemendi lisamisel või muutmisel saab sisendvälja tüübiks valida **Valik punktidega** või **Aja hindamine vahemikena**. Need töötavad ka kombineeritud hindamise osades.

- Valikule määra nimetus ja punktid. Kohtunik valib vastuse rippmenüüst; vastuse tunnus säilib ja arvutuses kasutatakse punkte.
- Ajatabelis sisesta kasvavas järjekorras iga vahemiku viimane sekund (`m:ss`) ja punktid. Esimene vahemik algab 0:00, järgmine eelmisele piirile järgnevast sekundist. Määra eraldi punktid pärast viimast ajapiiri.
- Valemis tähistab valiku- või ajavälja nimi selle eest saadud punkte. Tavalisest arvuväljast saab arvutada näiteks `sedelid * 2`.
- Märkeruut **Võrdsete ülesandepunktide korral on lühem aeg parem** järjestab sama ülesandeskooriga võistkonnad sisestatud aja järgi. Absoluutsete punktide korral see punkte ei muuda. Pingerea järgi punkte jagavates meetodites kasutatakse ajaga lahendatud kohta ka ülesande punktide arvutamiseks. Võistluse üld- ja klassipingereale eraldi ajapõhist viigilahutust ei lisata. Sama aeg jätab koha jagatuks. Kui viigiaegu on mitu, võrreldakse neid väljade järjekorras; puuduv aeg jääb sisestatud aja taha.

## Salvestamine

Andmebaasi migratsiooni pole vaja. `FieldDefinition.type` uued väärtused on `POINTS_SELECT` ja `TIME_POINTS`. Valikud, ajapiirid, ülempiiri punktid ja viigilahutuse lüliti salvestatakse `meta` JSON-i. `Result.values` sisaldab valiku stabiilset tunnust või algset kestust; `computeFields` teisendab need punktideks. CSV/Exceli import aktsepteerib valiku tunnust või täpset nimetust, aja puhul `m:ss` / `h:mm:ss`.
