# Teavitused

Rakendus salvestab töövoo muudatuse ja teavituse samas andmebaasitehingus.
Teavitus kuvatakse kasutaja töölaual kohe ning e-kiri saadetakse pärast tehingu
lõppu. Saatmise tõrge ei tühista kasutaja tegevust: e-kiri jääb outbox'i ja seda
proovitakse uuesti saata.

## Saadetavad teavitused

Esindajat teavitatakse registreeringu esitamisest, kinnitamisest,
ootenimekirja jõudmisest, ootenimekirjast edutamisest, täiendamisele saatmisest
ja tagasilükkamisest. Samuti teavitatakse mandaadi avamisest, esitamisest,
kinnitamisest ning täiendamisele saatmisest.

Võistluse aktiveerimisel saavad tulemuste avanemise teavituse esindaja ja kõik
võistkonna liikmed, kelle kirje on kasutajakontoga seotud. Sama kasutaja saab ühe
võistkonna kohta ühe kirja ka siis, kui ta on korraga liige ja esindaja.

## E-kirjade koondamine

Rakendusesisesed teavitused tekivad alati kohe ja iga võistkonna kohta eraldi.
E-kirjade saatmisel rakenduvad järgmised reeglid:

- registreerimise esitamise, automaatse kinnitamise ja ootenimekirja kiri
  saadetakse iga võistkonna kohta kohe;
- käsitsi kinnitatud registreeringud koondatakse sama kasutaja ja võistluse
  piires kümne minuti jooksul üheks kirjaks;
- mandaadi avanemisel saab esindaja ühe kirja, milles on kõik tema sama
  võistluse võistkonnad;
- käsitsi kinnitatavad mandaadi esitamised ja kinnitamised ning registreeringu
  või mandaadi täiendamisele saatmised koondatakse kümne minuti jooksul;
- automaatselt kinnitatud mandaat saadetakse kohe ühe teavitusena, mis ütleb,
  et mandaat on nii esitatud kui ka kinnitatud.

Kümne minuti aken on fikseeritud: see algab esimese sündmusega ega pikene sama
rühma järgmiste sündmuste lisandumisel. Eri kasutajate, võistluste ja sündmuste
teavitusi ei ühendata omavahel.

## Railway muutujad

Rakenduse teenuses peavad olema järgmised privaatsed muutujad:

```text
RESEND_API_KEY=re_...
EMAIL_FROM=Matkamängu portaal <teavitused@teated.matkamang.ee>
CRON_SECRET=pikk-juhuslik-saladus
```

Saatja domeen peab olema Resendis verifitseeritud. `Reply-To` aadressiks lisab
rakendus automaatselt vastava võistluse korraldaja konto e-posti aadressi.
`RESEND_API_KEY` on saladus: seda ei lisata lähtekoodi ega `NEXT_PUBLIC_`
muutujasse.

## Saatmise ja kordussaatmise ajastus

Lase eraldi Railway cron-teenusel teha iga 5 minuti järel järgmine päring:

```bash
curl --fail --silent --show-error \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/internal/notifications/deliver"
```

`APP_URL` on rakenduse HTTPS-aadress ilma lõpus oleva kaldkriipsuta. See cron on
vajalik ka kümne minuti koondamisaknaga kirjade saatmiseks; igapäevane
`personal-data-retention` cron seda ei asenda. Sama endpoint tuvastab ajakava
järgi äsja avanenud mandaadid ning saadab ootele jäänud kirju kuni kuue katsega.
Vastus sisaldab lisatud, saadetud ja ebaõnnestunud e-kirjade arve. Puuduvate
e-posti muutujate korral säilivad rakendusesisesed teavitused, kuid vastuses on
`configurationMissing: true`.
