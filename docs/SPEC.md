# Prompt – Milión pixelov na prenájom
> Kópia zadania z Claude Docs dokumentu „Prompt – Milión pixelov na prenájom“ (stav k 2026-10-10). Pôvodný dokument je zdroj pravdy.
>
> **Zmeny, o ktorých rozhodol zadávateľ počas práce** (platia namiesto textu nižšie):
> - **Kúpa navždy namiesto prenájmu** (2026-10-11): pixel stojí 0,10 € a platí sa raz. Nie sú doby 1/3/5 rokov,
>   zľavy, pripomienky, ochranná lehota ani predĺženie (časti 2, 3, 6, 8 a 14). „Navždy“ znamená, kým stránka
>   beží; čo dostanú majitelia pri prípadnom zatvorení, doplní do podmienok právnik. Dátum konca môžu mať len
>   miesta, ktoré si rezervuje administrátor.
> - **10 jazykov namiesto EN + SK** (2026-10-11): angličtina, slovenčina, čeština, nemčina, poľština, maďarčina,
>   francúzština, španielčina, taliančina a portugalčina. Administrácia ostáva po anglicky a po slovensky.
> - **Zatiaľ bez hostingu a domény** (2026-10-11): stránka beží na počítači zadávateľa z ikony na ploche
>   (databáza, server a prehliadač naraz, denné zálohy). Ostrý Stripe, hosting a doména prídu neskôr.
> - **Názov Million Pixel Website a bez slova „stena“** (2026-10-12): v textoch sa vo všetkých jazykoch hovorí
>   o pixeloch („tvoje pixely sú zverejnené“, „Späť na pixely“). Logo je vlastná pixelová kresba
>   zaplnenej plochy s farebnými „reklamami“, nie obrázok z The Million Dollar Homepage.

## 1. Zadanie a spôsob práce
Postav kompletnú, produkčne pripravenú webovú aplikáciu: verejnú stenu s presne 1 000 000 pixelov (1000 × 1000), ktorú si ktokoľvek môže po kúskoch prenajať za symbolický poplatok a vložiť do svojho kúska vlastný obrázok, fotku, kresbu alebo text s odkazom. Je to moderná verzia legendárnej The Million Dollar Homepage z roku 2005, s rovnakým princípom, rozmermi aj jednoduchým retro vzhľadom. Rozdiely: namiesto trvalého predaja je prenájom na dobu určitú, obsah pred zverejnením schvaľujeme a stránka má vlastnú značku.
Ako so mnou pracuj:
- Si skúsený full-stack vývojár, UX dizajnér a architekt škálovateľných webových aplikácií.
- So mnou komunikuj po slovensky. Kód, názvy v databáze a komentáre v kóde píš po anglicky.
- Postupuj po fázach z časti 14. Po každej fáze sa zastav a napíš mi, čo je hotové a ako to otestujem. Krok za krokom mi vysvetli, čo mám nastaviť sám (účty, API kľúče, premenné prostredia).
- Ak je niečo v zadaní nejasné alebo technicky nevhodné, navrhni lepšie riešenie a vysvetli prečo. Žiadne dôležité rozhodnutie nerob potichu.
- Všetky čísla z časti 2 (ceny, rozmery, lehoty) drž na jednom mieste v nastaveniach, aby sa dali meniť bez zásahu do kódu.

## 2. Parametre projektu
Používaj tieto predvolené hodnoty a ulož ich do nastavení v administrácii. Hodnoty v hranatých zátvorkách doplním sám.
| Parameter | Hodnota | Poznámka |
| --- | --- | --- |
| Názov stránky | [NÁZOV] | Vlastný názov aj logo, nie názov originálu. Návrhy: Million Pixel Wall, PixelStena. |
| Doména | [DOMÉNA] |  |
| Prevádzkovateľ | [meno alebo firma, IČO, sídlo, kontaktný e-mail] | Do pätičky a právnych stránok. |
| Jazyk webu | angličtina (hlavný) + slovenčina | Prepínač EN/SK, všetky texty v prekladových súboroch. |
| Rozmery steny | 1000 × 1000 px = 1 000 000 pixelov | Rovnako ako originál. |
| Najmenšia jednotka | blok 10 × 10 px (100 pixelov) | Stena má 100 × 100 = 10 000 blokov. |
| Cena | 0,10 € za pixel na 1 rok | Blok 10 × 10 px = 10 € ročne, celá stena = 100 000 € ročne. |
| Najmenší prenájom | 1 blok (10 €) |  |
| Najväčší prenájom | bez limitu | Nastaviteľné v administrácii. |
| Doba prenájmu | 1 rok / 3 roky / 5 rokov | Zľava 0 % / 10 % / 20 %. |
| Mena a ceny | EUR, konečné ceny | [som / nie som platca DPH] |
| Platby | Stripe Checkout | Karty, Apple Pay, Google Pay. |
| Rezervácia miesta | 15 min, pri prechode na platbu 30 min | Počas rezervácie miesto nemôže zobrať nikto iný. |
| Ochranná lehota po skončení | 14 dní | Obsah ostáva viditeľný, predĺžiť môže len pôvodný nájomca. |
| Schválenie obsahu | do 24 hodín |  |
| Formáty obrázkov | PNG, JPG, WebP, statický GIF | Najviac 10 MB. |


## 3. Koncept stránky
Stena má 1000 × 1000 pixelov rozdelených na 10 000 blokov po 10 × 10 px. Prenajíma sa vždy obdĺžnik z celých blokov.
- **Súradnice:** bloky 0–99 vodorovne aj zvislo, ľavý horný roh je (0, 0). V rozhraní ukazuj aj pixely, napríklad „x 340–379, y 120–139“.
- **Čo patrí k prenájmu:** obdĺžnik na stene, obrázok presne v jeho veľkosti, názov zobrazený pri prejdení myšou, voliteľný odkaz, voliteľné verejné meno nájomcu a dátum platnosti.
- **Typy obsahu:** nahratý obrázok alebo fotka, kresba v zabudovanom pixelovom editore, alebo farebná plocha s textom.
- **Doba:** 1, 3 alebo 5 rokov. Pred koncom sa dá predĺžiť. Po skončení a ochrannej lehote sa miesto uvoľní pre ďalších.
- **Schválenie:** nič sa na stene neobjaví bez schválenia moderátorom.
- **Pre koho:** malé firmy (reklama s odkazom), jednotlivci (fotka, pozdrav, pixel art), komunity a kluby, darček pre niekoho iného.
- **Hlavný odkaz v hlavičke:** „1 000 000 pixelov • 10 centov za pixel • [vlastný slogan]“. Návrh sloganu: „Leave your mark on the internet“ / „Nechaj na internete svoju stopu“.
Stránka má byť jednoduchá, zábavná a ľahko zdieľateľná. Každý nájomca má dôvod poslať priateľom odkaz na svoje miesto na stene.

## 4. Vzhľad – retro štýl ako The Million Dollar Homepage
Stránka má vyzerať ako web z roku 2005: biele pozadie, úzka hlavička a pod ňou stena 1000 × 1000 px ako hlavný obsah. Rozloženie a atmosféra majú byť veľmi podobné originálu, ale logo, názov a texty sú vlastné.
Rozloženie na počítači, zhora nadol:
1. **Hlavička** široká 1000 px, vycentrovaná a zarovnaná so stenou.
  - Vľavo logo: názov stránky výrazným tučným písmom, môže mať jemný pixelový motív.
  - Pod logom hlavný odkaz oddelený bodkami „•“ (sekcia 3).
  - Vpravo malý box s počítadlami: „Prenajaté pixely: 123 400 | Voľné: 876 600 | Posledný prenájom: pred 5 min“ a jednoduchý retro ukazovateľ zaplnenia v percentách.
2. **Navigácia** z textových odkazov oddelených „|“: Domov | Prenajať pixely | Ako to funguje | FAQ | Najnovšie | Moje pixely | Kontakt. Vpravo prepínač EN | SK.
3. **Stena** 1000 × 1000 px hneď pod navigáciou, s tenkým sivým rámikom. Nič ju neprekrýva a pri 100 % je viditeľná celá naraz, presne ako v origináli.
4. **Lišta pod stenou:** zväčšenie 100 % / 200 % / 400 % / 800 %, lupa, „Náhodné miesto“, vyhľadávanie a tlačidlo „Prenajať pixely“.
5. **Pätička** drobným písmom: © [rok] [NÁZOV], odkazy na Pravidlá obsahu, Obchodné podmienky, Ochranu osobných údajov, Nahlásiť obsah a Kontakt. Pridaj vetu: „Inšpirované The Million Dollar Homepage (2005). Nie sme s ňou nijako spojení.“
Štýl:
- **Písmo:** Verdana, Tahoma alebo Arial, 11–13 px, nadpisy tučné.
- **Farby:** biele pozadie, čierny text, sivé okraje 1 px (#cccccc), klasické modré podčiarknuté odkazy (#0000ee, navštívené #551a8b). Farebný akcent len v logu a v tlačidle „Prenajať pixely“.
- **Bez moderných prvkov:** žiadne gradienty, veľké zaoblenia, tiene, animované sekcie ani ikonky v kartách. Tlačidlá jednoduché s tenkým okrajom.
- **Voľné miesta na stene:** veľmi svetlo sivá (#f4f4f4). Od 200 % zväčšenia ukazuj jemnú mriežku blokov.
- **Ostré pixely:** pri zväčšení vždy `image-rendering: pixelated`, nikdy rozmazanie.
Na mobile:
- Hlavička sa poskladá pod seba a navigácia sa zalomí do dvoch riadkov, bez hamburger menu.
- Stena zaberie šírku obrazovky s okrajom 16 px, teda asi 360 px. Jeden blok má potom len asi 3,5 px, preto je zväčšovanie prstami povinné (sekcia 5).
- Tlačidlo „Prenajať pixely“ je pripnuté pri spodnom okraji obrazovky.
Ostatné podstránky majú rovnaký štýl: úzky stĺpec textu (najviac 700 px), jednoduché tabuľky a FAQ ako zoznam otázok s odpoveďami.

## 5. Stena a práca s ňou
Celá stena je jeden obrázok 1000 × 1000 px, ktorý server po každej zmene znovu poskladá. Interaktivitu zabezpečuje JavaScriptová vrstva nad ním.
- **Obrázok steny:** PNG alebo bezstratové WebP s verziou v adrese (napr. `wall.png?v=152`), aby sa po zmene hneď načítal nový. Nad ním je priehľadný canvas pre výber, mriežku a zvýraznenie.
- **Údaje pre interakciu:** endpoint `/api/wall.json` so všetkými aktívnymi prenájmami (id, x, y, šírka a výška v blokoch, názov, meno, doména odkazu). Je ich najviac 10 000. V prehliadači z nich postav mriežku 100 × 100 blokov s id prenájmu, aby vyhľadanie pod kurzorom bolo okamžité.
- **Klasická image map:** server vyrenderuje aj HTML `<map>` s `<area>` pre každý prenájom (href, title, alt), rovnako ako originál. Funguje to aj bez JavaScriptu a pomáha to vyhľadávačom.
- **Prejdenie myšou:** bublina s názvom, menom nájomcu a doménou odkazu, prenajatý obdĺžnik sa jemne zvýrazní.
- **Klik na prenajaté miesto:** malé okno s náhľadom zväčšeným 4×, názvom, menom a tlačidlami „Otvoriť odkaz“ (cez `/go/{id}`, v novom okne), „Zdieľať“ a „Nahlásiť“. V administrácii pridaj prepínač, ktorým sa na počítači dá odkaz otvárať priamo po kliknutí ako v origináli.
- **Klik na voľné miesto:** okno „Toto miesto je voľné“ s tlačidlom „Prenajať“, ktoré spustí objednávku s už vybraným blokom.
- **Zväčšenie:** 100–800 % kolieskom myši, tlačidlami alebo dvoma prstami, posun ťahaním, dvojité ťuknutie = 400 %. Zväčšuje sa len stena v rámiku, nie celá stránka.
- **Lupa:** kruh, ktorý ukazuje okolie kurzora zväčšené 6×. Slúži na prezeranie malých blokov bez zmeny zväčšenia.
- **Poloha v adrese:** `?x=34&y=12&zoom=4` (v blokoch). Takýto odkaz otvorí stenu presne na danom mieste a prenájom zvýrazní. Tlačidlo „Zdieľať“ ho skopíruje.
- **Vyhľadávanie** podľa názvu, mena alebo domény: priblíži a zvýrazní nájdený prenájom.
- **Náhodné miesto:** skok na náhodný aktívny prenájom.
- **Súradnice** pod kurzorom v lište, napr. „blok 34, 12 · px 340, 120“.
- **Ukáž voľné miesta:** prepínač, ktorý voľné bloky zvýrazní farbou.
- **Klávesnica:** šípky posúvajú, + a − zväčšujú, Esc zatvorí okno.

## 6. Prenájom krok za krokom
Objednávka má 9 krokov a celá musí fungovať aj na mobile bez registrácie vopred. Doba prenájmu začína plynúť až od schválenia obsahu.
1. **Výber miesta.** Tlačidlo „Prenajať pixely“ zapne režim výberu. Používateľ ťahá obdĺžnik, ktorý sa prichytáva na mriežku 10 × 10 px, a priebežne vidí rozmer v px aj v blokoch, počet pixelov a cenu. Obsadené bloky vo výbere sa zafarbia na červeno a výber nejde potvrdiť.
  - Na mobile: zväčšiť stenu, ťuknúť na prvý roh, potom na druhý a výber doladiť úchytmi.
  - Súradnice a rozmer sa dajú zadať aj ručne.
  - Pomocník „Nájdi mi miesto“: zadám rozmer (napr. 50 × 50 px) a server ponúkne voľné miesta, najbližšie k stredu aj náhodné.
2. **Rezervácia.** Po potvrdení server v jednej transakcii zarezervuje bloky na 15 minút (sekcia 11). Ak miesto medzitým niekto zobral, ukáž to a ponúkni najbližšie voľné. Počas rezervácie beží odpočítavanie a ostatní vidia miesto ako rezervované.
3. **Obsah.** Tri karty: Nahrať obrázok, Nakresliť, Farba + text (sekcia 7). Výsledok je vždy PNG presne vo veľkosti výberu.
4. **Údaje.**
  - Názov: povinný, najviac 80 znakov, zobrazí sa pri prejdení myšou.
  - Odkaz: voliteľný, len http alebo https.
  - Verejné meno alebo prezývka: voliteľné.
  - E-mail: povinný, slúži na prihlásenie, doklad a pripomienky.
  - Doba prenájmu: 1, 3 alebo 5 rokov.
  - Súhlas s obchodnými podmienkami a pravidlami obsahu.
  - Súhlas so začatím poskytovania služby pred uplynutím lehoty na odstúpenie od zmluvy (znenie overí právnik).
  - Voliteľný súhlas so zasielaním noviniek.
5. **Súhrn.** Náhľad obsahu vloženého priamo do aktuálnej steny na zvolenom mieste, rozmer, poloha, doba a cena s rozpisom. Cenu počíta výhradne server.
6. **Platba.** Stripe Checkout s kartami, Apple Pay a Google Pay. Pred presmerovaním predĺž rezerváciu na 30 minút a rovnako nastav vypršanie Checkout Session (`expires_at`), inak by platila 24 hodín. Ak platba príde po vypršaní rezervácie a miesto medzitým zobral niekto iný, peniaze automaticky vráť a pošli e-mail s ospravedlnením.
7. **Po zaplatení.** Stránka „Ďakujeme“ so stavom „Čaká na schválenie, zvyčajne do 24 hodín“. E-mail s potvrdením, dokladom a odkazom do sekcie Moje pixely.
8. **Schválenie.** Obsah sa objaví na stene do 2 minút. Príde e-mail „Tvoje pixely sú na stene“ s odkazom priamo na miesto a tlačidlami na zdieľanie.
9. **Zamietnutie.** E-mail s dôvodom a možnosťou nahrať iný obsah do 7 dní. Ak to nájomca nespraví, celú platbu automaticky vráť cez Stripe a miesto uvoľni.

## 7. Editor obsahu
Všetky tri spôsoby vytvoria PNG presne vo veľkosti prenajatého obdĺžnika. Náhľad ukazuj v skutočnej veľkosti aj zväčšený 8×.
**A) Nahrať obrázok alebo fotku**
- PNG, JPG, WebP alebo statický GIF (z animovaného len prvý snímok), najviac 10 MB.
- Orezanie s pevným pomerom strán výberu (posun a priblíženie), potom zmenšenie na presný rozmer kvalitným filtrom (Lanczos).
- Upozornenie, ak bude obrázok po zmenšení nečitateľný, napríklad drobný text v malom bloku, s tipom zvoliť väčšie miesto.
- Voliteľný „retro efekt“, ktorý obmedzí paletu na 8, 16 alebo 32 farieb.
- Odstránenie metadát EXIF vrátane GPS polohy.
**B) Nakresliť v pixelovom editore**
- Plátno má presne rozmer výberu a každý pixel je štvorček. Editor sa dá zväčšovať a mriežka zapínať a vypínať.
- Nástroje: ceruzka, guma, výplň, čiara, obdĺžnik, kvapkadlo a hrúbka štetca 1–10 px.
- Paleta 32 farieb, vlastná farba cez HEX a naposledy použité farby.
- Späť a Znova aspoň 50 krokov, Vymazať všetko a vloženie obrázka ako podkladu.
- Rozpracovaná kresba sa priebežne ukladá v prehliadači. Ak úložisko nie je dostupné, editor funguje ďalej bez neho.
- Ovládanie myšou aj prstom.
**C) Farba + text**
- Farba pozadia, text, farba textu a zarovnanie. Text sa vykreslí pixelovým písmom (napr. 5 × 7 px) a sám sa zalamuje.
- Ak sa text nezmestí, editor na to upozorní. Do bloku 10 × 10 px sa zmestí len jedno písmeno alebo symbol a náhľad to musí jasne ukázať.
**Pre všetky spôsoby**
- Ukladá sa výsledné PNG aj originál, kvôli moderácii a neskorším úpravám.
- Konečné spracovanie robí server (kontrola súboru, prekódovanie), nie iba prehliadač.
- Rovnaký editor sa použije aj pri neskoršej zmene obsahu v sekcii Moje pixely.

## 8. Moje pixely, koniec a predĺženie prenájmu
Nájomca sa prihlasuje bez hesla, odkazom z e-mailu, a v sekcii Moje pixely spravuje všetky svoje prenájmy.
**Moje pixely**
- Prihlásenie odkazom z e-mailu platným 15 minút. Účet sa automaticky spáruje s e-mailom z objednávky.
- Zoznam prenájmov: náhľad, poloha s odkazom na stenu, rozmer, stav (čaká na schválenie, aktívny, v ochrannej lehote, skončený, zamietnutý), platnosť do, počet kliknutí na odkaz a otvorení okna po dňoch.
- Akcie: zmeniť obsah, názov alebo odkaz (každá zmena ide znova na schválenie a dovtedy ostáva starý obsah), predĺžiť, stiahnuť doklad, zdieľať, zapnúť alebo vypnúť pripomienky.
- Prevod prenájmu na iný e-mail, napríklad ako darček.
- Zrušenie účtu a vymazanie osobných údajov. Doklady sa uchovajú, ako vyžaduje zákon.
**Koniec a predĺženie**
- Pripomienky e-mailom 30, 7 a 1 deň pred koncom s odkazom na predĺženie jedným klikom.
- Predĺžiť sa dá kedykoľvek počas prenájmu. Nová doba nadväzuje na koniec tej pôvodnej.
- Po skončení plynie ochranná lehota 14 dní. Obsah ostáva na stene, pre ostatných je miesto stále obsadené a predĺžiť môže len pôvodný nájomca.
- Po ochrannej lehote obsah zo steny zmizne, bloky sa uvoľnia a nájomca dostane e-mail.
- Administrátor môže prenájom predĺžiť aj zadarmo, napríklad ako kompenzáciu.
- Automatické predlžovanie s uloženou kartou príde až v neskoršej fáze a len s výslovným súhlasom nájomcu.

## 9. Moderácia, pravidlá a nahlasovanie
Na stenu sa nič nedostane bez schválenia človekom. Automatické kontroly pomáhajú moderátorovi a zachytia zjavné problémy ešte pred ním.
**Pravidlá obsahu** (vlastná stránka a súhlas pri objednávke). Zakázané je:
- čokoľvek nezákonné;
- nahota, pornografia a sexuálny obsah;
- násilie, krv a zbrane v útočnom kontexte;
- nenávisť, extrémistické symboly, šikanovanie a obťažovanie;
- osobné údaje alebo fotky iných ľudí bez ich súhlasu;
- podvody, phishing, malvér, pyramídové schémy a hazard bez licencie;
- cudzie logá, postavičky a iný obsah, na ktorý nájomca nemá práva;
- politická reklama, čím sa zjednodušia povinnosti podľa pravidiel EÚ;
- odkazy na stránky s takýmto obsahom.
**Automatické kontroly pred moderáciou**
- **Obrázok:** služba na rozpoznanie nevhodného obsahu (napr. Google Cloud Vision SafeSearch, Amazon Rekognition alebo Sightengine). Výsledok ulož a vysoké skóre moderátorovi zvýrazni.
- **Ochrana detí:** porovnanie s databázou známeho zneužívajúceho materiálu (napr. Cloudflare CSAM Scanning Tool alebo Microsoft PhotoDNA). Pri zhode obsah okamžite zablokuj, nikomu ho nezobrazuj a postupuj podľa zákonnej povinnosti nahlásiť ho úradom.
- **Odkaz:** kontrola cez Google Safe Browsing vrátane cieľa po presmerovaniach. Všetky aktívne odkazy kontroluj znova raz denne.
- **Text:** filter vulgarizmov a nenávistných výrazov v názve a mene, po slovensky aj po anglicky.
- Konkrétne služby vyber podľa aktuálnej ponuky a ceny, uvedené sú len príklady.
**Moderačná fronta**
- Obsah zväčšený aj vložený do steny, výsledky kontrol, názov, odkaz s doménou a história nájomcu.
- Akcie: Schváliť, Zamietnuť s dôvodom (šablóny aj vlastný text), Vyžiadať úpravu. Klávesové skratky a ukazovateľ času čakania s cieľom do 24 hodín.
- Zamietnutie pred schválením znamená vrátenie celej platby. Odstránenie schváleného obsahu pre porušenie pravidiel je bez náhrady, podľa obchodných podmienok.
**Nahlasovanie a povinnosti podľa DSA**
- Tlačidlo „Nahlásiť“ pri každom prenájme a stránka Nahlásiť obsah: kategória, popis, voliteľný e-mail. Ochrana proti spamu (Cloudflare Turnstile a limit počtu).
- Potvrdenie prijatia nahlásenia a oznámenie rozhodnutia nahlasovateľovi.
- Pri odstránení obsahu pošli nájomcovi odôvodnenie a možnosť ohradiť sa.
- **Núdzové skrytie:** moderátor skryje prenájom jedným klikom a obsah zmizne zo steny do 2 minút vrátane cache.
- Kontaktné miesto pre úrady aj používateľov podľa nariadenia o digitálnych službách (DSA) na stránke Kontakt.
- Každé rozhodnutie sa zapíše do auditného záznamu.

## 10. Administrácia
Administrácia je samostatná časť `/admin`, prístupná len s rolou admin alebo moderátor a s dvojfaktorovým overením. Moderátor vidí iba moderáciu a nahlásenia, admin všetko.
- **Prehľad:** tržby za deň, týždeň, mesiac a celkovo, prenajaté pixely a percento steny, aktívne prenájmy, počet čakajúcich na schválenie, otvorené nahlásenia, prenájmy končiace do 30 dní a konverzia od výberu miesta po platbu.
- **Moderácia a Nahlásenia** podľa sekcie 9.
- **Prenájmy:** vyhľadávanie podľa e-mailu, názvu, domény alebo súradníc. Detail s históriou obsahu a platieb. Akcie: skryť, odstrániť, predĺžiť zadarmo, vrátiť peniaze celé alebo čiastočne cez Stripe, zmeniť obsah v zastúpení nájomcu.
- **Rezervované miesta:** admin vyhradí bloky bez platby, napríklad pre vlastnú reklamu, charitu alebo súťaže.
- **Nastavenia:** všetky hodnoty zo sekcie 2, text oznamu v hlavičke, prepínač „Predaj pozastavený“ pre údržbu a prepínač priameho otvárania odkazov.
- **E-mailové šablóny:** náhľad a úprava textov po slovensky aj po anglicky.
- **Nástroje:** znova vygenerovať obrázok steny, export dát do CSV, auditný záznam a správa rolí.

## 11. Technické riešenie a dátový model
Odporúčaný základ je Next.js, Supabase a Stripe. Ak pracuješ v nástroji, ktorý Next.js nepodporuje (napr. Lovable), použi React + Vite + Supabase Edge Functions a obrázky skladaj knižnicou, ktorá v tom prostredí beží. Rozdiely mi vysvetli.
| Časť | Odporúčanie |
| --- | --- |
| Frontend a server | Next.js (App Router) + TypeScript |
| Štýly | čisté CSS alebo Tailwind, vždy v retro štýle zo sekcie 4 |
| Databáza, prihlásenie, súbory | Supabase: Postgres, Auth s prihlásením odkazom, Storage |
| Platby | Stripe Checkout + webhooky |
| Spracovanie obrázkov | sharp (libvips) na serveri |
| E-maily | Resend alebo Postmark, šablóny SK/EN |
| Hosting a plánované úlohy | Vercel + Vercel Cron, alebo pg_cron v Supabase |
| Úložisko a CDN obrázka steny | Supabase Storage alebo Cloudflare R2 |
| Ochrana pred botmi | Cloudflare Turnstile |
| Analytika a chyby | Plausible alebo Umami bez cookies, Sentry |

**Dátový model** (súradnice a rozmery sú v blokoch 10 × 10 px):
```
rentals (
  id uuid primary key,
  user_id uuid references auth.users,
  x smallint, y smallint,          -- 0–99, ľavý horný roh
  w smallint, h smallint,          -- šírka a výška v blokoch
  status text,                     -- hold | awaiting_payment | in_review | active | grace | ended | rejected | removed | refunded
  period_years smallint,
  hold_expires_at timestamptz,
  starts_at timestamptz, ends_at timestamptz,
  price_cents int, currency text default 'EUR',
  active_content_id uuid,
  created_at timestamptz, updated_at timestamptz
)

-- obsadenosť: jeden riadok = jeden blok, primárny kľúč zabráni prekrývaniu
block_cells (
  bx smallint, by smallint,
  rental_id uuid references rentals on delete cascade,
  primary key (bx, by)
)

content_versions (id, rental_id, kind, source_path, png_path, title, url, display_name,
                  status, auto_checks jsonb, moderator_id, reason, created_at, decided_at)
payments        (id, rental_id, stripe_session_id, stripe_payment_intent_id, amount_cents,
                  status, refunded_cents, invoice_number, created_at)
reports         (id, rental_id, category, description, reporter_email, status, resolution,
                  created_at, resolved_at)
click_stats     (rental_id, day, clicks, opens, primary key (rental_id, day))
wall_versions   (id, image_path, changed_rect, created_at)
settings        (key text primary key, value jsonb)
audit_log       (id, actor_id, action, target, details jsonb, created_at)
profiles        (user_id, display_name, locale, marketing_consent)
stripe_events   (event_id primary key, processed_at)   -- každý webhook sa spracuje len raz
```
**Kľúčové pravidlá**
- **Rezervácia je jedna transakcia:** vlož riadok do `rentals` so stavom `hold` a všetky jeho bloky do `block_cells`. Konflikt primárneho kľúča znamená obsadené miesto, transakcia sa zruší a API vráti chybu 409 so zoznamom obsadených blokov.
- **Uvoľnenie miesta** = zmazanie jeho riadkov z `block_cells`: pri vypršanej rezervácii, zamietnutí s vrátením peňazí, konci ochrannej lehoty a odstránení.
- **Cena** sa počíta len na serveri: pixely × cena za pixel × roky × (1 − zľava).
- **Row Level Security:** používateľ číta a mení len svoje prenájmy. Verejnosť vidí len aktívny schválený obsah cez `/api/wall.json`. Admin a moderátor majú rolu v tokene.
**API**
- `GET /api/wall.json` – aktívne prenájmy, cache 30 s
- `GET /api/stats` – počítadlá, cache 30 s
- `GET /api/find-space?w=&h=` – návrhy voľných miest
- `POST /api/holds`, `DELETE /api/holds/{id}` – vytvorenie a zrušenie rezervácie
- `POST /api/rentals/{id}/content` – nahratie obsahu
- `POST /api/checkout` – vytvorenie Stripe Checkout Session
- `POST /api/stripe/webhook` – `checkout.session.completed`, `checkout.session.expired`, `charge.refunded`, s overením podpisu
- `GET /go/{id}` – presmerovanie na odkaz nájomcu a počítanie kliknutí
- `POST /api/reports` – nahlásenie obsahu
- `/api/admin/*` – administrácia
**Plánované úlohy**
- Každú minútu: uvoľniť vypršané rezervácie a prekresliť stenu, ak sa niečo zmenilo.
- Denne: pripomienky konca prenájmu, presun do ochrannej lehoty a uvoľnenie po nej, kontrola odkazov a záloha databázy.

## 12. Výkon a bezpečnosť
Stránka sa má na 4G načítať do 2,5 s a musí byť odolná voči zneužitiu, pretože obrázky aj odkazy dodávajú cudzí ľudia.
**Výkon**
- **Skladanie steny:** po zmene vezmi posledný obrázok steny, prekresli len zmenený obdĺžnik (nový obsah alebo prázdne miesto) a ulož novú verziu s vyšším číslom. Raz denne poskladaj celú stenu načisto ako kontrolu.
- Obrázok steny ako bezstratové WebP so záložným PNG a dlhou cache vďaka verzii v adrese. `/api/wall.json` komprimovaný, s cache 30 s.
- Rámik steny má pevný rozmer, aby sa stránka pri načítaní neposúvala.
- Plynulé zväčšovanie a posun aj na bežnom telefóne s Androidom: CSS transformácie, nie prekresľovanie celého obrázka.
- Hlavná stránka sa renderuje na serveri kvôli rýchlemu prvému zobrazeniu a vyhľadávačom.
**Bezpečnosť**
- **Nahraté súbory:** kontrola skutočného typu podľa obsahu, nie prípony. Limit 10 MB a 6000 × 6000 px, ochrana proti dekompresným bombám (limit pixelov v sharp), prekódovanie do PNG a odstránenie metadát.
- **Odkazy:** len http a https, normalizované, zákaz `javascript:` a `data:`. Navonok iba cez `/go/{id}`, v novom okne a s `rel="nofollow sponsored ugc noopener noreferrer"`.
- **Texty:** všetko od používateľov escapovať, žiadne HTML od používateľov a prísna Content Security Policy.
- **Limity požiadaviek:** najviac 3 aktívne rezervácie na IP adresu alebo e-mail, limity aj na nahlasovanie, nahrávanie a prihlasovanie. Turnstile pri začatí objednávky a pri nahlasovaní.
- **Platby:** overenie podpisu Stripe webhookov, každá udalosť spracovaná len raz, žiadne údaje o kartách u nás.
- **Kľúče** iba v premenných prostredia, nikdy v kóde ani v prehliadači.
- **Prevádzka:** administrácia s 2FA, auditný záznam, denné zálohy databázy a originálov obrázkov.
- **GDPR:** len nevyhnutné osobné údaje, analytika bez cookies, export a zmazanie údajov na požiadanie.

## 13. Ďalšie stránky, SEO a zdieľanie
Okrem steny potrebuje web niekoľko podstránok, zdieľaciu stránku pre každý prenájom a prvky, ktoré podporia šírenie.
**Podstránky**
- **Ako to funguje:** 3 kroky (Vyber miesto → Nahraj alebo nakresli → Zaplať a si na stene) a cenník s príkladmi: 10 × 10 px = 10 €, 50 × 50 px = 250 €, 100 × 100 px = 1 000 € ročne.
- **FAQ:** Koľko to stojí? Ako dlho prenájom platí? Čo môžem nahrať? Kedy bude obsah na stene? Čo ak obsah zamietnete? Môžem ho neskôr zmeniť? Čo sa stane po skončení? Prečo sa predáva po blokoch 10 × 10? Môžem prenájom darovať? Dostanem doklad?
- **Najnovšie:** posledných 50 schválených prenájmov s náhľadmi. Klik priblíži miesto na stene.
- **Kontakt:** formulár, e-mail, údaje o prevádzkovateľovi a kontaktné miesto podľa DSA.
- **Pravidlá obsahu, Obchodné podmienky, Reklamačný poriadok, Ochrana osobných údajov:** priprav ich ako šablóny s poľami [doplniť]. Finálne znenie dodám po kontrole právnikom.
- **Nahlásiť obsah:** formulár zo sekcie 9.
- **Stránka 404** v rovnakom retro štýle.
**SEO a zdieľanie**
- Titulky a popisy stránok v oboch jazykoch, `hreflang`, `sitemap.xml` a `robots.txt`.
- Open Graph obrázok hlavnej stránky je aktuálna stena, obnovuje sa raz denne.
- Každý prenájom má zdieľaciu stránku `/p/{id}`: OG obrázok s výrezom steny okolo prenájmu (zväčšený, s ostrými pixelmi) a text „Mám svoje miesto na [NÁZOV]!“. Po otvorení presmeruje na stenu s priblíženým miestom.
- Image map s odkazmi a alt textami zo sekcie 5.
**Funkcie na neskôr**
- Živý pás „Práve prenajaté: 20 × 20 px – [názov]“.
- Časozberné video, ako sa stena zapĺňa, z denných snímok.
- Míľniky v hlavičke: 10 %, 25 %, 50 % a „Vypredané!“.
- Darčekový prenájom s PDF certifikátom (poloha, náhľad, platnosť).
- „Pixel dňa“: vybraný prenájom zvýraznený na hlavnej stránke.
- Charitatívna zóna: tržby z vyhradenej oblasti idú na vybraný dobrý účel.
- Odporúčanie: zľava 10 % pre nájomcu, ktorý privedie ďalšieho.

## 14. Postup po fázach
Stav projekt v 4 fázach. Po každej sa zastav, zhrň výsledok, napíš mi, ako ho vyskúšam a čo mám nastaviť, a počkaj na moje potvrdenie.
1. **Základ a vzhľad**
  - Projekt, databáza a retro dizajn: hlavička, navigácia, počítadlá, pätička, prepínač jazyka.
  - Stena z databázy: skladanie obrázka, `wall.json`, image map, bublina, okno po kliknutí, zväčšenie, lupa a ovládanie na mobile.
  - Skript s testovacími dátami, ktorý vytvorí asi 300 náhodných farebných prenájmov rôznych veľkostí. Jedným príkazom sa dajú zmazať.
2. **Prenájom a platby**
  - Výber miesta, rezervácie cez `block_cells` a pomocník „Nájdi mi miesto“.
  - Editor obsahu (nahratie, kreslenie, text) a spracovanie na serveri.
  - Stripe Checkout v testovacom režime, webhooky a e-maily o platbe.
  - Schválenie zatiaľ jednoduchým tlačidlom v administrácii.
3. **Účty, moderácia a administrácia**
  - Prihlásenie odkazom z e-mailu a sekcia Moje pixely.
  - Administrácia, moderačná fronta, automatické kontroly, nahlasovanie, núdzové skrytie a auditný záznam.
  - Všetky e-maily po slovensky aj po anglicky.
4. **Prevádzka a spustenie**
  - Koniec prenájmu, pripomienky, predĺženie a ochranná lehota.
  - Podstránky, šablóny právnych textov, SEO, zdieľacie stránky a analytika.
  - Kontrola podľa sekcie 15, prepnutie Stripe do ostrého režimu a nastavenie záloh.
  - Potom funkcie na neskôr podľa môjho výberu.

## 15. Akceptačné kritériá a čo nerobiť
Projekt je hotový, keď prejde všetkými bodmi nižšie. Ku každému napíš, ako si ho overil.
- Dvaja ľudia nemôžu prenajať prekrývajúce sa miesto ani pri kliknutí v tej istej sekunde (test súbežných požiadaviek).
- Zmena ceny v prehliadači nemá vplyv na sumu v Stripe.
- Nezaplatená rezervácia sa uvoľní najneskôr minútu po vypršaní.
- Obsah sa objaví na stene až po schválení, do 2 minút. Po skrytí do 2 minút zmizne, aj z cache.
- Pri zamietnutí príde e-mail s dôvodom. Ak nájomca do 7 dní nenahrá iný obsah, peniaze sa vrátia automaticky.
- Platba, ktorá príde po vypršaní rezervácie na medzitým obsadené miesto, sa automaticky vráti.
- Pri zväčšení sú pixely ostré štvorčeky.
- Na iPhone v Safari a na Androide v Chrome funguje zväčšovanie, posun aj výber miesta prstom.
- Hlavná stránka sa na 4G načíta do 2,5 s a pri načítaní sa neposúva.
- Počítadlá v hlavičke sedia s databázou.
- Odkaz `javascript:` ani stránku označenú ako nebezpečnú nejde uložiť.
- Stena s 10 000 prenájmami po jednom bloku sa načíta a reaguje plynulo (záťažový test).
- Pripomienky, ochranná lehota a uvoľnenie miesta fungujú (test s posunutými dátumami).
- Všetky texty sú po slovensky aj po anglicky.
**Čo nerobiť**
- Nekopíruj logo, názov, texty ani obrázky The Million Dollar Homepage. Podobný má byť princíp, rozloženie a atmosféra, nie konkrétne prvky.
- Never cene ani dostupnosti, ktoré pošle prehliadač.
- Žiadne animované GIFy ani video na stene.
- Žiadne HTML ani skripty od používateľov.
- Nemeň retro vzhľad na moderný „startup“ dizajn.
- Nič nezverejňuj bez schválenia.
- Neukladaj údaje o kartách, platby rieši len Stripe.
- Nenechávaj testovacie dáta v ostrej prevádzke.
