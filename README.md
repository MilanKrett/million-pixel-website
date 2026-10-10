# Million Pixel Wall

Verejná stena s 1 000 000 pixelov (1000 × 1000), ktorú si ľudia prenajímajú po blokoch 10 × 10 px.
Moderná verzia The Million Dollar Homepage (2005) s prenájmom na dobu určitú a schvaľovaním obsahu.

Zadanie projektu: [docs/SPEC.md](docs/SPEC.md) (kópia dokumentu „Prompt – Milión pixelov na prenájom“).

## Stav projektu

| Fáza | Obsah | Stav |
| --- | --- | --- |
| 1 | Základ, retro dizajn, stena z databázy, zväčšovanie, lupa, mobil, testovacie dáta | hotová |
| 2 | Výber miesta, rezervácie, editor obsahu, Stripe (test), e-maily o platbe | čaká |
| 3 | Prihlásenie odkazom, Moje pixely, administrácia, moderácia, nahlasovanie | čaká |
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
- **Všetky čísla** (ceny, rozmery, lehoty) sú v tabuľke `settings`. Predvolené hodnoty sú
  v [src/lib/settings/schema.ts](src/lib/settings/schema.ts); chýbajúce kľúče doplní `db:migrate`.
- **Jazyky**: angličtina na `/…`, slovenčina na `/sk/…`, texty v [src/messages](src/messages).

## Štruktúra

```
supabase/migrations/   SQL schéma (rovnaká pre lokálnu databázu aj Supabase)
scripts/               dev server, databáza, testovacie dáta, prekreslenie steny
src/app/               stránky ([locale]) a API (/api/wall.json, /api/stats, /go/{číslo})
src/components/wall/   interaktívna stena (canvas, zväčšovanie, lupa, okná, vyhľadávanie)
src/components/site/   hlavička, menu, pätička, počítadlá
src/lib/               databáza, nastavenia, úložisko súborov, skladanie obrázka steny
src/messages/          preklady EN / SK
tests/                 unit testy a databázové testy
```

## Prevádzka (fáza 4)

Produkcia: Vercel + Supabase (Postgres a Storage) + Stripe. Podrobný návod na nastavenie
účtov a premenných prostredia príde vo fázach 2–4; prehľad premenných je v `.env.example`.
