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

## Kordussaatmise ajastus

Lase Railway cron-teenusel teha iga 5–10 minuti järel järgmine päring:

```bash
curl --fail --silent --show-error \
  --header "Authorization: Bearer ${CRON_SECRET}" \
  "${APP_URL}/api/internal/notifications/deliver"
```

`APP_URL` on rakenduse HTTPS-aadress ilma lõpus oleva kaldkriipsuta. Sama
endpoint tuvastab ajakava järgi äsja avanenud mandaadid ning saadab ootele
jäänud kirju kuni kuue katsega. Vastus sisaldab lisatud, saadetud ja
ebaõnnestunud teavituste arve. Puuduvate e-posti muutujate korral säilivad
rakendusesisesed teavitused, kuid vastuses on `configurationMissing: true`.
