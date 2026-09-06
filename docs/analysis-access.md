# VK analüüsi vaate ligipääs

Pingerea avalikul lehel on link „VK analüüs →". Vaikimisi viib see otse
analüüsi vaatesse, mis tähendab, et pingerea jagamine jagab ühtlasi ka
analüüsi. Seda saab võistluse kaupa seadistada.

## Režiimid

Seade asub töölaual: **Võistlus → Avalik vaade**.

| Režiim | Link pingereas | `/public/<id>/analysis` | Eraldi link |
|---|---|---|---|
| `PUBLIC` (vaikimisi) | nähtav | avatud | – |
| `LINK_ONLY` | peidetud | 404 | `/analysis/<tunnus>` |
| `PRIVATE` | peidetud | 404 | – |

Analüüsist pingereasse tagasi saab alati, igas režiimis.

Olemasolevad võistlused jäävad `PUBLIC`-režiimi, seega käitumine ei muutu
enne, kui korraldaja selle ise ümber lülitab.

## Eraldi link

`LINK_ONLY`-le lülitudes luuakse 256-bitine juhuslik tunnus. Andmebaasi
salvestatakse ainult selle SHA-256 räsi (`Competition.analysisTokenHash`),
seega täisaadressi näidatakse ainult korra — salvestamise järel. Kui aadress
kaob, tuleb luua uus; vana lakkab siis kohe kehtimast.

Sama muster on kasutusel registreerimislingil, vt
[registration-and-mandate.md](registration-and-mandate.md).

## Mida see ei tee

Tunnusega link ei ole kasutajapõhine ega aegu. Kes iganes lingi saab, näeb
analüüsi ja võib seda edasi jagada. Kui analüüs peab jääma kindlale ringile,
kasuta `PRIVATE`-režiimi ja näita andmeid töölaualt.

## Korraldajate ligipääs

Võistlusega seotud kasutajad — korraldajad, kohtunikud ja vaatlejad — pääsevad
`/public/<id>/analysis` aadressile ka `LINK_ONLY`- ja `PRIVATE`-režiimis, kui
nad on sisse logitud. Ligipääsu kontrollib `canViewCompetition`.
