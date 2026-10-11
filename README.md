# Million Pixel Wall

Verejná stena s 1 000 000 pixelov (1000 × 1000), ktorú si ľudia prenajímajú po blokoch 10 × 10 px.
Moderná verzia The Million Dollar Homepage (2005) s prenájmom na dobu určitú a schvaľovaním obsahu.

Zadanie projektu: [docs/SPEC.md](docs/SPEC.md) (kópia dokumentu „Prompt – Milión pixelov na prenájom“).

## Stav projektu

| Fáza | Obsah | Stav |
| --- | --- | --- |
| 1 | Základ, retro dizajn, stena z databázy, zväčšovanie, lupa, mobil, testovacie dáta | hotová |
| 2 | Výber miesta, rezervácie, editor obsahu, platba (zatiaľ testovacia, bez Stripe), e-maily o platbe | hotová |
| 3 | Prihlásenie odkazom, Moje pixely, administrácia s 2FA, moderácia, automatické kontroly, nahlasovanie | hotová |
| 4 | Koniec prenájmu, podstránky, právne šablóny, SEO, ostrá prevádzka | čaká |

## Spustenie na počítači

Potrebuješ len [Node.js 22+](https://nodejs.org) (máš 24). Žiadny Docker ani účty: databáza
PostgreSQL 17 sa spúšťa priamo z balíčkov projektu a súbory sa ukladajú do priečinka `.data`.

```bash
npm install
```

```bash
npm run dev
```

Potom otvor <http://localhost:3000> (slovenčina: <http://localhost:3000/sk>).

Pri prvom spustení sa vytvorí databáza v `.data/postgres` a nastavenia sa naplnia predvolenými
hodnotami. Súbor `.env.local` s lokálnymi nastaveniami už existuje (vzor je v `.env.example`).

### Testovacie dáta

```bash
npm run seed
```

Vytvorí asi 300 náhodných farebných prenájmov rôznych veľkostí (aj čakajúce na schválenie,
skryté, v ochrannej lehote a rozpracované rezervácie). Všetko sa dá zmazať jedným príkazom:

```bash
npm run seed:clear
```

Záťažový test s 10 000 prenájmami po jednom bloku:

```bash
npm run seed -- --count=10000 --size=1
```

Testovacie dáta majú v databáze príznak `is_test`, v ostrej prevádzke (`APP_ENV=production`)
ich skript odmietne vytvoriť a `seed:clear` ich vie odstrániť aj tam.

### Vyskúšanie objednávky

1. Na <http://localhost:3000/rent> vyber miesto ťahaním po stene (na mobile dve ťuknutia na rohy)
   alebo cez „Nájdi mi miesto“ a klikni **Pokračovať** – miesto sa zarezervuje na 15 minút.
2. Nahraj obrázok, nakresli ho alebo zvoľ farbu s textom, potom vyplň údaje.
3. V súhrne klikni **Zaplatiť**. Otvorí sa testovacia platobná stránka (žiadne skutočné peniaze);
   vyber „Zaplatiť (test)“, „Zrušiť a vrátiť sa“ alebo „Nechať platbu vypršať“.
4. Odoslané e-maily (doklad o platbe, schválenie, odkazy na prihlásenie) sú na
   <http://localhost:3000/dev/emails>.
5. Schválenie v administrácii (nižšie). Po schválení sa obsah do pár sekúnd objaví na stene.

Testovacia platba a schránka `/dev/emails` v ostrej prevádzke (`APP_ENV=production`) nefungujú.

### Administrácia

1. V `.env.local` je v `ADMIN_EMAILS` tvoja e-mailová adresa; kto sa ňou prihlási, je administrátor.
2. Otvor <http://localhost:3000/admin>, zadaj tú adresu a odkaz na prihlásenie si otvor
   v <http://localhost:3000/dev/emails> (v ostrej prevádzke príde e-mailom).
3. Pri prvom prihlásení si nastav dvojfaktorové prihlásenie: naskenuj QR kód aplikáciou na
   overovanie (Google Authenticator, Microsoft Authenticator, 1Password…) a ulož si záložné kódy.
4. Moderácia: klávesy **A** schváliť, **E** vyžiadať úpravu, **R** zamietnuť, **J/K** ďalší/predošlý.
5. Moderátorov a ďalších administrátorov pridáš v **Nástroje**.

### Moje pixely a nahlasovanie

- <http://localhost:3000/my-pixels>: prihlásenie e-mailom z objednávky, zoznam prenájmov, zmena
  obsahu (ide na schválenie, starý obsah ostáva), doklady, štatistiky, prevod na iný e-mail,
  pripomienky, zrušenie účtu.
- Na stene v okne prenájmu je **Nahlásiť**; formulár je aj na <http://localhost:3000/report>.

### Vyskúšanie na mobile

Telefón musí byť na tej istej Wi-Fi ako počítač. Po `npm run dev` otvor v telefóne adresu
z riadku „Network“ (napr. `http://192.168.0.196:3000`). Ak sa nenačíta, povoľ vo Windows
firewall pre Node.js prístup v súkromnej sieti.

## Užitočné príkazy

| Príkaz | Čo robí |
| --- | --- |
| `npm run dev` | lokálna databáza + migrácie + vývojový server |
| `npm run db:start` / `npm run db:stop` | spustí / zastaví lokálnu databázu na pozadí |
| `npm run db:migrate` | aplikuje migrácie na databázu z `DATABASE_URL` (lokálnu aj Supabase) |
| `npm run db:reset` | zmaže LOKÁLNU databázu a vytvorí ju znova |
| `npm run seed` / `npm run seed:clear` | testovacie dáta |
| `npm run wall:render` | prekreslí zmenené miesta steny (`-- --full` celú stenu) |
| `npm test` | rýchle testy bez databázy |
| `npm run test:db` | testy proti skutočnej databáze (vytvorí si vlastnú `pixelwall_test`) |
| `npm run test:all` | všetky testy |
| `npm run lint` / `npm run typecheck` | kontrola kódu |
| `npm run build` | produkčný build (potrebuje bežiacu databázu) |

## Ako to funguje

- **Stena** je jeden obrázok 1000 × 1000 px (bezstratové WebP + PNG s číslom verzie v adrese).
  Po každej zmene server prekreslí len zmenené obdĺžniky a uloží novú verziu; databázový trigger
  sám zaznamená, čo treba prekresliť (`wall_dirty`).
- **V prehliadači** sa stena kreslí do canvasu bez vyhladzovania, takže pixely sú pri každom
  zväčšení ostré štvorčeky. Pod canvasom je klasický obrázok s HTML image map, ktorý funguje aj
  bez JavaScriptu a číta ho vyhľadávač.
- **Obsadenosť** sa stráži v databáze: tabuľka `block_cells` má jeden riadok na blok a primárny
  kľúč (bx, by), takže dve prekrývajúce sa rezervácie nemôžu vzniknúť ani v tej istej milisekunde.
- **Objednávka bez účtu**: prehliadač dostane httpOnly cookie s náhodným kľúčom; v databáze je
  len jeho odtlačok (hash). Rezervácia, ktorej vypršal čas, sa považuje za voľnú okamžite (aj keď
  minútová úloha ešte nebežala). Nová rezervácia z toho istého prehliadača („Zmeniť miesto“,
  „Rezervovať znova“) nahradí starú a prenesie obrázok (pri rovnakom rozmere), e-mail a obdobie.
- **Cena** sa počíta len na serveri. Platba je za konkrétnu sumu a obdobie; ak príde po vypršaní
  rezervácie a miesto medzitým obsadil niekto iný, peniaze sa automaticky vrátia.
- **Pixelový filter**: nahratá fotka sa premení presne na toľko pixelov, koľko má prenajatá plocha
  (napr. 100 × 60 = 6 000). Dá sa zvoliť veľkosť pixelu (1, 2, 5 alebo 10 px), štýl (fotka, retro
  32/16/8 farieb, Game Boy, čiernobiela, odtiene sivej), rozptyl (dithering) a jas, kontrast,
  sýtosť. Ten istý kód ([src/lib/content/pixel-filter.ts](src/lib/content/pixel-filter.ts)) robí
  živý náhľad v prehliadači aj konečný obrázok na serveri.
- **Obrázky** idú z prehliadača priamo do úložiska (obchádza limit 4,5 MB na Verceli), server ich
  potom oreže, zmenší (lanczos3), prežene pixelovým filtrom a uloží bez metadát (GPS, EXIF).
- **Účty** nemajú heslo: prihlasuje sa odkazom z e-mailu (platí raz, 15 minút). Účet automaticky
  vlastní všetky prenájmy objednané s tou adresou. Administrátori a moderátori musia mať
  dvojfaktorové prihlásenie (kód z aplikácie, po 12 hodinách znova).
- **Moderácia**: nič nejde na stenu bez schválenia. Zamietnutý nový prenájom má 7 dní na nový
  obsah, inak sa peniaze vrátia automaticky. Zmena bežiaceho prenájmu ide na schválenie a dovtedy
  ostáva starý obsah. Každé rozhodnutie je v auditnom zázname.
- **Automatické kontroly** pomáhajú moderátorovi: filter vulgarizmov (SK/CZ/EN), sledovanie
  presmerovaní odkazu a voliteľne Google Web Risk / Safe Browsing a rozpoznávanie obrázkov
  (Sightengine alebo Google Vision). Bez kľúčov sa preskočia. Odkazy na stene sa kontrolujú znova
  každý deň (`/api/cron/daily`); nebezpečný odkaz prestane fungovať a vznikne nahlásenie.
- **Všetky čísla** (ceny, rozmery, lehoty) sú v tabuľke `settings`. Predvolené hodnoty sú
  v [src/lib/settings/schema.ts](src/lib/settings/schema.ts); chýbajúce kľúče doplní `db:migrate`.
- **Jazyky**: angličtina na `/…`, slovenčina na `/sk/…`, texty v [src/messages](src/messages).

## Štruktúra

```
supabase/migrations/   SQL schéma (rovnaká pre lokálnu databázu aj Supabase)
scripts/               dev server, databáza, testovacie dáta, prekreslenie steny
src/app/               stránky ([locale]), administrácia (admin) a API
src/components/wall/   interaktívna stena (canvas, zväčšovanie, lupa, okná, vyhľadávanie, výber)
src/components/rent/   objednávka: výber miesta, nahrávanie, kreslenie, text, údaje, súhrn
src/components/site/   hlavička, menu, pätička, počítadlá, nahlásenie, Turnstile
src/components/account/ prihlásenie, Moje pixely, zmena obsahu, prevod
src/components/admin/  obrazovky administrácie
src/lib/auth/          účty, prihlásenie odkazom, relácie, dvojfaktorové prihlásenie
src/lib/account/       Moje pixely: zmeny obsahu, prevod, zrušenie účtu
src/lib/moderation/    rozhodnutia, nahlásenia, automatické kontroly
src/lib/admin/         dáta a akcie administrácie
src/lib/orders/        rezervácie, objednávka, platba, schválenie, e-maily k objednávke
src/lib/content/       spracovanie obrázkov, redukcia farieb, text v pixelovom písme
src/lib/payments/      platobná brána (testovacia, neskôr Stripe)
src/lib/email/         šablóny a odosielanie e-mailov
src/lib/               databáza, nastavenia, úložisko súborov, skladanie obrázka steny
src/messages/          preklady EN / SK
tests/                 unit testy a databázové testy
```

## Prevádzka (fáza 4)

Produkcia: Vercel + Supabase (Postgres a Storage) + Stripe. Podrobný návod na nastavenie
účtov a premenných prostredia príde vo fázach 2–4; prehľad premenných je v `.env.example`.
