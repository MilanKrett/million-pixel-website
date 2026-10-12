# Million Pixel Website

Milión pixelov na jednom mieste (1000 × 1000), z ktorých si ľudia kupujú miesto po blokoch 10 × 10 px.
Moderná verzia The Million Dollar Homepage (2005): pixel stojí 0,10 €, platí sa raz a obsah ostáva
zverejnený navždy (kým stránka beží). Každý obrázok pred zverejnením schvaľuje človek.

Zadanie projektu: [docs/SPEC.md](docs/SPEC.md) (kópia dokumentu „Prompt – Milión pixelov na prenájom“).
Na jeho začiatku sú zapísané zmeny, o ktorých si rozhodol počas práce: kúpa navždy namiesto prenájmu,
10 jazykov a zatiaľ žiadny hosting ani doména.

## Stav projektu

| Fáza | Obsah | Stav |
| --- | --- | --- |
| 1 | Základ, retro dizajn, obrázok pixelov z databázy, zväčšovanie, lupa, mobil, testovacie dáta | hotová |
| 2 | Výber miesta, rezervácie, editor obsahu, platba (zatiaľ testovacia, bez Stripe), e-maily o platbe | hotová |
| 3 | Prihlásenie odkazom, Moje pixely, administrácia s 2FA, moderácia, automatické kontroly, nahlasovanie | hotová |
| 4 | Kúpa navždy, 10 jazykov, podstránky, právne šablóny, SEO, zdieľanie, kontakt, ikona na ploche, zálohy | hotová; ostrá prevádzka (hosting, doména, Stripe) neskôr |

## Spustenie z ikony na ploche

Stránka beží na tvojom počítači ako aplikácia. Potrebuješ len [Node.js 22+](https://nodejs.org)
(máš 24). Ikonu vytvoríš raz:

```bash
npm run desktop:install
```

Na ploche pribudne **Million Pixel Website** (staršiu ikonu inštalácia sama nahradí). Dvojklik otvorí okno, ktoré:

1. raz denne zálohuje databázu a obrázky (do `.data/backups`, databázu za posledných 7 dní),
2. spustí databázu a doplní do nej nové migrácie,
3. ak sa zmenil kód, zostaví stránku (prvýkrát to trvá pár minút),
4. spustí stránku na <http://localhost:3000> (ak je port obsadený, zoberie ďalší voľný) a otvorí prehliadač,
5. každú minútu a raz denne spúšťa naplánované úlohy (uvoľnenie nezaplatených rezervácií, vrátenie
   peňazí, kontrola odkazov, prekreslenie obrázka pixelov, upratanie jeho starých verzií).

**Zatvorením okna sa stránka aj databáza vypnú.** To isté bez ikony: `npm run desktop`.

Zálohy: priečinok `db-RRRR-MM-DD` je celá databáza; obnovíš ju tak, že pri vypnutej stránke nahradíš
`.data/postgres` jeho obsahom. Priečinok `storage` je kópia všetkých nahratých obrázkov (nič sa z neho
nemaže). Ak chceš zálohy inde (napríklad v priečinku OneDrive), nastav v `.env.local` `BACKUP_DIR=…`.
Ak nechceš, aby sa otváral prehliadač, nastav `DESKTOP_NO_BROWSER=1`.

## Jazyky

Web je v 10 jazykoch: angličtina (hlavná, bez predpony: `/`, `/faq`…), slovenčina `/sk`, čeština `/cs`,
nemčina `/de`, poľština `/pl`, maďarčina `/hu`, francúzština `/fr`, španielčina `/es`, taliančina `/it`
a portugalčina `/pt`. Pri prvej návšteve hlavnej stránky sa jazyk vyberie podľa prehliadača, prepínač
jazyka si voľbu zapamätá. E-maily idú v jazyku, v ktorom človek objednával. Administrácia je po
anglicky a po slovensky (podľa jazyka účtu).

Texty sú v `src/messages/<jazyk>.json`, administrácia v `src/messages/admin/`. Testy strážia, aby mali
všetky jazyky rovnaké kľúče a premenné a aby žiadny text neostal omylom po anglicky. Preklady mimo
slovenčiny a angličtiny som urobil ja; pred spustením odporúčam dať ich prečítať rodeným hovorcom,
hlavne právne texty.

## Vývoj

Žiadny Docker ani účty: databáza PostgreSQL 17 sa spúšťa priamo z balíčkov projektu a súbory sa
ukladajú do priečinka `.data`.

```bash
npm install
```

```bash
npm run dev
```

Potom otvor <http://localhost:3000> (slovenčina: <http://localhost:3000/sk>). Vývojový server sa po
každej zmene kódu sám obnoví; ikona na ploche spúšťa rýchlejšiu produkčnú verziu.

Pri prvom spustení sa vytvorí databáza v `.data/postgres` a nastavenia sa naplnia predvolenými
hodnotami. Súbor `.env.local` s lokálnymi nastaveniami už existuje (vzor je v `.env.example`).

### Testovacie dáta

```bash
npm run seed
```

Vytvorí asi 300 náhodných farebných miest rôznych veľkostí (aj čakajúce na schválenie, skryté
a rozpracované rezervácie). Všetko sa dá zmazať jedným príkazom:

```bash
npm run seed:clear
```

Záťažový test s 10 000 miestami po jednom bloku:

```bash
npm run seed -- --count=10000 --size=1
```

Testovacie dáta majú v databáze príznak `is_test`, v ostrej prevádzke (`APP_ENV=production`)
ich skript odmietne vytvoriť a `seed:clear` ich vie odstrániť aj tam.

### Vyskúšanie objednávky

1. Na <http://localhost:3000/buy> vyber miesto ťahaním po pixeloch (na mobile dve ťuknutia na rohy)
   alebo cez „Nájdi mi miesto“ a klikni **Pokračovať**. Miesto sa zarezervuje na 15 minút.
2. Nahraj fotku (pixelový filter ju premení na presne toľko pixelov, koľko kupuješ), nakresli
   obrázok alebo zvoľ farbu s textom, potom vyplň údaje.
3. V súhrne klikni **Zaplatiť**. Otvorí sa testovacia platobná stránka (žiadne skutočné peniaze);
   vyber „Zaplatiť (test)“, „Zrušiť a vrátiť sa“ alebo „Nechať platbu vypršať“.
4. Odoslané e-maily (doklad o platbe, schválenie, odkazy na prihlásenie a správy z kontaktného
   formulára, ak je v Nastaveniach vyplnený kontaktný e-mail) sú na <http://localhost:3000/dev/emails>.
5. Schváľ obsah v administrácii (nižšie). Po schválení sa do pár sekúnd zverejní a pixely
   patria kupujúcemu natrvalo.

Testovacia platba a schránka `/dev/emails` v ostrej prevádzke (`APP_ENV=production`) nefungujú.

### Administrácia

1. V `.env.local` je v `ADMIN_EMAILS` tvoja e-mailová adresa; kto sa ňou prihlási, je administrátor.
2. Otvor <http://localhost:3000/admin>, zadaj tú adresu a odkaz na prihlásenie si otvor
   v <http://localhost:3000/dev/emails> (v ostrej prevádzke príde e-mailom).
3. Pri prvom prihlásení si nastav dvojfaktorové prihlásenie: naskenuj QR kód aplikáciou na
   overovanie (Google Authenticator, Microsoft Authenticator, 1Password…) a ulož si záložné kódy.
4. Moderácia: klávesy **A** schváliť, **E** vyžiadať úpravu, **R** zamietnuť, **J/K** ďalší/predošlý.
5. **Správy** sú správy z kontaktného formulára; po vybavení ich označ ako vybavené.
6. V **Nastaveniach** doplň údaje prevádzkovateľa (meno alebo firma, IČO, sídlo, kontaktný e-mail).
   Zobrazia sa v pätičke, na stránke Kontakt, v právnych textoch a na dokladoch.
7. Moderátorov a ďalších administrátorov pridáš v **Nástrojoch**.

### Moje pixely a nahlasovanie

- <http://localhost:3000/my-pixels>: prihlásenie e-mailom z objednávky, zoznam miest, zmena obsahu
  (ide na schválenie, starý obsah ostáva), doklady, štatistiky, darovanie miesta na iný e-mail,
  zrušenie účtu.
- V okne každého miesta je **Nahlásiť**; formulár je aj na <http://localhost:3000/report>.

### Podstránky

| Adresa | Obsah |
| --- | --- |
| `/how-it-works` | Ako to funguje, cenník s príkladmi |
| `/faq` | Časté otázky |
| `/latest` | Najnovšie obrázky |
| `/contact` | Kontaktný formulár, údaje prevádzkovateľa, kontaktné miesto podľa DSA |
| `/content-rules`, `/terms`, `/complaints`, `/privacy` | Pravidlá obsahu, obchodné podmienky, reklamačný poriadok, ochrana súkromia |
| `/p/<číslo>` | Zdieľacia stránka miesta s náhľadovým obrázkom pre sociálne siete |
| `/sitemap.xml`, `/robots.txt` | Pre vyhľadávače |

Právne texty sú **šablóny**: miesta na doplnenie sú zvýraznené žltou („[doplniť]“) a pred spustením
ich musí skontrolovať právnik (najmä čo dostanú majitelia, ak by sa stránka niekedy zatvárala).

### Vyskúšanie na mobile

Telefón musí byť na tej istej Wi-Fi ako počítač. Po `npm run dev` otvor v telefóne adresu
z riadku „Network“ (napr. `http://192.168.0.196:3000`). Ak sa nenačíta, povoľ vo Windows
firewall pre Node.js prístup v súkromnej sieti.

## Užitočné príkazy

| Príkaz | Čo robí |
| --- | --- |
| `npm run desktop` | stránka na tomto počítači (to isté ako ikona na ploche) |
| `npm run desktop:install` | vytvorí ikonu na ploche |
| `npm run dev` | lokálna databáza + migrácie + vývojový server |
| `npm run db:start` / `npm run db:stop` | spustí / zastaví lokálnu databázu na pozadí |
| `npm run db:migrate` | aplikuje migrácie na databázu z `DATABASE_URL` (lokálnu aj Supabase) |
| `npm run db:reset` | zmaže LOKÁLNU databázu a vytvorí ju znova |
| `npm run seed` / `npm run seed:clear` | testovacie dáta |
| `npm run wall:render` | prekreslí zmenené miesta obrázka pixelov (`-- --full` celý obrázok) |
| `npm test` | rýchle testy bez databázy |
| `npm run test:db` | testy proti skutočnej databáze (vytvorí si vlastnú `pixelwall_test`) |
| `npm run test:all` | všetky testy |
| `npm run lint` / `npm run typecheck` | kontrola kódu |
| `npm run build` | produkčný build (potrebuje bežiacu databázu) |

## Ako to funguje

- **Všetky pixely** tvoria jeden obrázok 1000 × 1000 px (bezstratové WebP + PNG s číslom verzie v adrese).
  Po každej zmene server prekreslí len zmenené obdĺžniky a uloží novú verziu; databázový trigger
  sám zaznamená, čo treba prekresliť (`wall_dirty`). Staré verzie sa raz denne upracú.
- **V prehliadači** sa pixely kreslia do canvasu bez vyhladzovania, takže pixely sú pri každom
  zväčšení ostré štvorčeky. Pod canvasom je klasický obrázok s HTML image map, ktorý funguje aj
  bez JavaScriptu a číta ho vyhľadávač.
- **Obsadenosť** sa stráži v databáze: tabuľka `block_cells` má jeden riadok na blok a primárny
  kľúč (bx, by), takže dve prekrývajúce sa rezervácie nemôžu vzniknúť ani v tej istej milisekunde.
- **Kúpa navždy**: zaplatené a schválené miesto nemá dátum konca. Dátum konca môžu mať len miesta,
  ktoré si v administrácii rezervuješ sám (**Rezervované miesta**); po ňom sa samy uvoľnia.
- **Objednávka bez účtu**: prehliadač dostane httpOnly cookie s náhodným kľúčom; v databáze je
  len jeho odtlačok (hash). Rezervácia, ktorej vypršal čas, sa považuje za voľnú okamžite (aj keď
  minútová úloha ešte nebežala). Nová rezervácia z toho istého prehliadača („Zmeniť miesto“,
  „Rezervovať znova“) nahradí starú a prenesie obrázok (pri rovnakom rozmere) aj údaje.
- **Cena** sa počíta len na serveri. Platba je za konkrétnu sumu; ak príde po vypršaní
  rezervácie a miesto medzitým obsadil niekto iný, peniaze sa automaticky vrátia.
- **Pixelový filter**: nahratá fotka sa premení presne na toľko pixelov, koľko má kúpená plocha
  (napr. 100 × 60 = 6 000). Dá sa zvoliť veľkosť pixelu (1, 2, 5 alebo 10 px), štýl (fotka, retro
  32/16/8 farieb, Game Boy, čiernobiela, odtiene sivej), rozptyl (dithering) a jas, kontrast,
  sýtosť. Ten istý kód ([src/lib/content/pixel-filter.ts](src/lib/content/pixel-filter.ts)) robí
  živý náhľad v prehliadači aj konečný obrázok na serveri.
- **Obrázky** idú z prehliadača priamo do úložiska (obchádza limit 4,5 MB na Verceli), server ich
  potom oreže, zmenší (lanczos3), prežene pixelovým filtrom a uloží bez metadát (GPS, EXIF).
- **Účty** nemajú heslo: prihlasuje sa odkazom z e-mailu (platí raz, 15 minút). Účet automaticky
  vlastní všetky miesta objednané s tou adresou. Administrátori a moderátori musia mať
  dvojfaktorové prihlásenie (kód z aplikácie, po 12 hodinách znova).
- **Moderácia**: nič sa nezverejní bez schválenia. Zamietnutá nová objednávka má 7 dní na nový
  obsah, inak sa peniaze vrátia automaticky. Zmena zverejneného obsahu ide na schválenie a dovtedy
  ostáva starý obsah. Každé rozhodnutie je v auditnom zázname.
- **Automatické kontroly** pomáhajú moderátorovi: filter vulgarizmov (SK/CZ/EN), sledovanie
  presmerovaní odkazu a voliteľne Google Web Risk / Safe Browsing a rozpoznávanie obrázkov
  (Sightengine alebo Google Vision). Bez kľúčov sa preskočia. Zverejnené odkazy sa kontrolujú znova
  každý deň (`/api/cron/daily`); nebezpečný odkaz prestane fungovať a vznikne nahlásenie.
- **Zdieľanie**: každé miesto má stránku `/p/<číslo>` s náhľadovým obrázkom (výrez pixelov s názvom),
  ktorý ukážu Facebook, X, WhatsApp a ďalšie siete. Z e-mailu o schválení sa dá zdieľať jedným klikom.
- **Bezpečnosť**: prísne hlavičky (Content-Security-Policy, zákaz vloženia do cudzej stránky, HSTS
  na https), Cloudflare Turnstile proti robotom a obmedzenie počtu pokusov.
- **Návštevnosť** sa dá merať bez cookies cez Plausible alebo Umami (premenné `ANALYTICS_*`
  v `.env.example`); bez nich sa nič nemeria.
- **Všetky čísla** (cena, rozmery, lehoty) sú v tabuľke `settings`. Predvolené hodnoty sú
  v [src/lib/settings/schema.ts](src/lib/settings/schema.ts); chýbajúce kľúče doplní `db:migrate`.

## Štruktúra

```
supabase/migrations/   SQL schéma (rovnaká pre lokálnu databázu aj Supabase)
scripts/               ikona na ploche, dev server, databáza, zálohy, testovacie dáta, prekreslenie obrázka
src/app/               stránky ([locale]), administrácia (admin), API, náhľadové obrázky (og)
src/components/wall/   interaktívne pixely (canvas, zväčšovanie, lupa, okná, vyhľadávanie, výber)
src/components/rent/   objednávka: výber miesta, nahrávanie, kreslenie, text, údaje, súhrn
src/components/site/   hlavička, menu, pätička, počítadlá, podstránky, právne texty, kontakt
src/components/account/ prihlásenie, Moje pixely, zmena obsahu, darovanie
src/components/admin/  obrazovky administrácie
src/i18n/              jazyky, výber jazyka podľa prehliadača, preklady pre prehliadač
src/lib/auth/          účty, prihlásenie odkazom, relácie, dvojfaktorové prihlásenie
src/lib/account/       Moje pixely: zmeny obsahu, darovanie, zrušenie účtu
src/lib/moderation/    rozhodnutia, nahlásenia, automatické kontroly
src/lib/admin/         dáta a akcie administrácie
src/lib/orders/        rezervácie, objednávka, platba, schválenie, e-maily k objednávke
src/lib/content/       spracovanie obrázkov, redukcia farieb, text v pixelovom písme
src/lib/payments/      platobná brána (testovacia, neskôr Stripe)
src/lib/email/         šablóny a odosielanie e-mailov
src/lib/               databáza, nastavenia, úložisko súborov, skladanie obrázka pixelov, SEO
src/messages/          texty v 10 jazykoch, administrácia (admin/) po anglicky a po slovensky
tests/                 unit testy a databázové testy
```

## Ostrá prevádzka (neskôr)

Hosting a doménu riešime neskôr, preto web zatiaľ beží len na tvojom počítači. Na spustenie na
internete bude treba:

- hosting (navrhujem Vercel), databázu s úložiskom obrázkov (Supabase) a doménu,
- účet Stripe (karty, Apple Pay, Google Pay); zatiaľ funguje len testovacia platba,
- Resend na posielanie e-mailov a Cloudflare Turnstile proti robotom,
- naplánované úlohy `/api/cron/minute` (každú minútu) a `/api/cron/daily` (raz denne),
- zálohy databázy u poskytovateľa (Supabase ich robí sám),
- údaje prevádzkovateľa v administrácii a právne texty skontrolované právnikom.

Všetky premenné prostredia sú popísané v `.env.example`.
