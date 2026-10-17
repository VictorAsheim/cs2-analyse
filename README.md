# CS2 demoanalyse

Last opp en `.dem` fra en CS2-kamp og få ut deterministisk statistikk om begge
lag. Hver prosent oppgis med teller og nevner, og hver runde kan spores tilbake
til tick-intervallet den ble lest fra.

## Arkitektur

```
web/          Next.js 16 — opplasting, jobbstatus, visning
worker/       Python — parsing og statistikk
  cs2intel/
    props.py     feltstier i demoen + enum-mapping
    extract.py   demo -> runder, drap, granater, økonomi, posisjoner
    metrics.py   sidevinnerrater, åpningsdueller, trades
    economy.py   kjøpstyper og anti-eco
    utility.py   granatbruk og -effekt
    players.py   spillerstatistikk og clutcher
    areas.py     bombesite-oppløsning og verden→radar-transform
    site_metrics.py  angrep/forsvar per site, CT-oppsett, retake-tider
    tactics.py   angrepsmønstre: executes, rush, split, fake, lurk (utledet)
    findings.py  rangerte funn + sammendrag
  parse_demo.py  CLI: demo -> facts-JSON
  verify.py      kryssjekker en parset demo mot seg selv
data/
  uploads/    opplastede demoer
  jobs/       jobbstatus + worker-logg
  facts/      ferdig statistikk (JSON), posisjoner (parquet), radarbilde (PNG)
```

Parsingen kjører som en frittstående prosess, ikke i en HTTP-request: en demo
er 100–600 MB, og web-laget skal ikke holde forbindelsen åpen mens den leses.
Nettsiden får en jobb-ID og poller.

## Kjøre

Python-miljøet er i `.venv` og inneholder `demoparser2` og `awpy`.

```bash
npm --prefix web run dev
```

Parse en demo direkte, uten nettsiden:

```bash
.venv/Scripts/python.exe worker/parse_demo.py <demo.dem> -o out.facts.json
```

Kontroller at tallene fra en demo henger sammen:

```bash
.venv/Scripts/python.exe worker/verify.py <demo.dem>
```

`verify.py` sjekker identiteter som må holde hvis uthentingen er riktig:
rundeseire skal summere til antall runder, drap skal være lik dødsfall, den
rekonstruerte oversikten over hvem som lever skal forklare hvert dødsfall, hvert
plant skal tilskrives nøyaktig én site, og ingen projisert hendelse skal falle
utenfor radarbildet. Exit ≠ 0 betyr at tallene fra den demoen ikke bør
rapporteres.

## Ytelse

En 561 MB demo med 29 runder parses på ca. 7 sekunder og gir 0,4 MB facts-JSON,
62 000 samplede posisjoner og en kopi av kartets radarbilde (0,14 MB), slik at en
ferdig analyse ikke avhenger av awpy-cachen. Posisjoner samples til 2 Hz — taktisk
bevegelse er fullt lesbar der, og hele 64-Hz-rutenettet er ~30× dataene uten
analytisk gevinst.

## Områder: hva som finnes, og hva som ikke gjør det

**CS2 har ingen offentlige callout-navn.** Det nye nav-formatet droppet
place-navnene CS:GO hadde, og awpy sine data inneholder dem ikke: nav-meshen er
ren geometri (2738 områder på Inferno, ingen navnekolonne) og `map_data.json` er
bare radarkalibrering. Derfor finnes det ingen «Banana» eller «Apps» her, og
ingen rutestatistikk.

Det som *er* autoritativt:

- **Bombesitene.** `bomb_planted`-eventet bærer et site-felt, så sitene skilles
  av demoen selv. Posisjonen deres leses av plant-koordinatene.
- **Radarkalibreringen** fra awpy plasserer enhver verdenskoordinat på det
  offisielle radarbildet. Validert: 742 projiserte hendelser, null utenfor
  bildet, og 17 av 17 plants innenfor sin egen site-sirkel.

A/B-bokstaven er det eneste kuraterte. Den ligger i `SITE_REFERENCE_POINTS` i
[areas.py](worker/cs2intel/areas.py), holdt adskilt fra alt som er målt, og hver
site rapporterer sin observerte sentroide ved siden av merkelappen slik at
navngivingen kan kontrolleres mot radaren. **Legg bare til et kart der etter å ha
sjekket en ekte demos plant-sentroider mot punktet** — og merk at kart med
vertikalt stablede siter (Nuke) ikke kan skilles av et 2D-punkt i det hele tatt.

## Konvensjoner, ikke måledata

Alt i `stats` er lest fra demoen eller følger aritmetisk av den. Fire ting er
valg, og alle rapporteres med terskelen som ga resultatet:

- **Kjøpstype** utledes av lagets samlede utstyrsverdi ved slutten av
  freezetime (`full_buy ≥ $20 000`, `semi_buy ≥ $10 000`, `force_buy ≥ $5 000`).
- **Trade** er et drap som hevner en lagkamerat innen 5 sekunder, der offeret er
  spilleren som drepte lagkameraten.
- **CT-oppsett** leses 20 sekunder etter freezetime, eller rett før rundens
  første drap om det kom tidligere. Ved freezetime-slutt står alle fortsatt i
  spawn, så det øyeblikket sier ingenting om oppsettet; etter første kontakt
  viser posisjonene reaksjon, ikke intensjon.
- **Site-radius** dekker den målte plant-spredningen pluss en margin, ikke
  kartets faktiske trigger-geometri.

## Hvordan siden er bygget opp

Siden leder med det som er verdt å handle på, ikke med alt som er målt:

1. **Sammendrag** — sammenleggbart, lukket. Resultat, T/CT per lag, og det
   verste funnet for hvert lag.
2. **Prioriterte funn** — de fem øverste, med resten bak en knapp.
3. **Kart** — radaroverlay med filtre.
4. **Grafer** — kampforløp, granatbruk og angrepsmønstre.
5. **Detaljer** — alle tabellene, i seks sammenleggbare grupper.

[findings.py](worker/cs2intel/findings.py) rangerer funn etter **effekt ganget
med utvalgsstørrelse**, der utvalgsvekten stiger med nevneren og kappes på 1.
Produktet gjør at en 100 %-rate over to runder ikke kan slå en 25 %-rate over
tolv — den feilmoden et én-demos utvalg inviterer til. Ingenting måles her:
et funn er en omskriving av tall regnet ut andre steder, pluss regelen som
valgte det ut, så hvert funn peker på seksjonen det kan kontrolleres i.

En regel som fyrer på alt er verdiløs: første versjon markerte «står
forutsigbart» for hver eneste CT-spiller, fordi alle har en side de tar. Den
regelen ble strammet til å bare treffe spillere som er både forutsigbare og
nesten aldri på siten — den framskutte varianten som faktisk kan isoleres.

Grafene bruker de mørke stegene av referansepaletten, validert mot appens egen
flate `#0b0b0c`: lyshetsbånd, kromagulv, CVD-separasjon (verste nabopar 8,4) og
3:1 kontrast passerer alle. Fargene er definert som tokens i
[globals.css](web/app/globals.css), og grafene er skrevet mot rollene.

## Angrepsmønstre: den ene utledede delen

[tactics.py](worker/cs2intel/tactics.py) merker hver T-runde som execute, rush,
split, fake, slow default eller light/dry hit. **Dette er den eneste delen av
systemet som ikke er målt.** Demoen lagrer hvor spillerne var, ikke hva de
ville, så merkelappene er lesninger av bevegelse mot faste terskler. Hver runde
bærer terskelen, sekundet merkelappen ble avgjort på, og bevisene.

To designvalg holder det ærlig:

- **Målsiten leses fra plantet der det finnes** (17 av 29 runder her), og
  utledes bare ellers. Hver runde rapporterer `target_source`, så en leser ser
  per rad om siten er lest eller gjettet. Grensesnittet viser det som grønt
  «plant» mot grått «utledet».
- **Plantet binder ankomsttiden i begge retninger.** Det gir en ankomst når
  bevegelsesregelen ikke fant noen, og kapper en som lander etter plantet — en
  enslig planter utløser først gruppekravet når hjelpen kommer. Begge
  korreksjoner havner i `arrival_rule_misses`.

`verify.py` sjekker den harde konsistensen: en runde kan ikke merkes mot én site
når bomben ble plantet på den andre.

Terskler som gir merkelappene: ankomst krever minst 2 levende angripere som
samtidig utgjør halvparten av de gjenlevende; rush ≤ 25 s, slow ≥ 60 s; execute
krever minst 2 røyk/molotov nær siten i vinduet −12 s/+5 s; split krever
innkomstretninger minst 60° fra hverandre; fake krever 2+ spillere holdt i 4+
sekunder på den andre siten pluss utility brukt der; lurk er 1800 enheter fra
gruppen ved ankomst.

Ikke implementert, og derfor ikke rapportert:

- **Rutestatistikk og rotasjonstider mellom navngitte områder** — blokkert av
  at callouts ikke finnes. Retake-ankomst til site er implementert og dekker
  den mest brukbare delen.
- **Flere demoer per lag.** Én demo kan ikke skille et gjentakende mønster fra
  en engangshendelse. Dette står i `data_limits` i hver facts-fil, og det
  rammer angrepsmønstrene hardest: 14 av 29 runder her får lav konfidens.

## Merknader om demoformatet

Tredjeparts serverdemoer (eBot, FACEIT) mangler `round_start`- og
`round_end`-events. Rundegrenser hentes derfor fra tellerne
`m_nRoundStartCount` og `m_nRoundEndCount`, og utfall fra
`m_iRoundEndWinnerTeam` og `m_eRoundEndReason`. `m_iBombSite` er observert som
0 gjennom hele kamper og brukes ikke; bombesite må utledes fra planterens
koordinater når områdelaget er på plass.

Halvdeler utledes fra når rosteren faktisk bytter side, ikke fra
`m_iFirstSecondHalfRound` — det feltet er upålitelig i tredjepartsdemoer. Når
de to er uenige, vinner det observerte byttet og uenigheten havner i
`warnings`. Overtid leses fra `m_nOvertimePlaying`, så halvdels-telleren
nullstilles ved hver OT-periode.
