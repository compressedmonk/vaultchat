# VaultChat — Technikai Dokumentáció

## Mi ez?

A VaultChat egy **privacy-first AI workspace**: egy ChatGPT-szerű webalkalmazás, amelyben minden beszélgetés és feltöltött fájl **kliens-oldali, zero-knowledge titkosítással** van védve. A szerver soha nem látja a beszélgetések tartalmát visszafejtett (plaintext) formában — kizárólag titkosított blobokat tárol. A felhasználó jelszavából származtatott kulccsal oldja fel a vault-ot, és csak a böngészőben létezik a visszafejtett privát kulcs.

---

## Architektúra áttekintés

```
┌─────────────────────────────────────────────────────────┐
│                      BÖNGÉSZŐ                           │
│                                                         │
│  ┌─────────────┐   ┌──────────────┐   ┌──────────────┐ │
│  │  Jelszó      │──>│ PBKDF2 KEK   │──>│ RSA privát   │ │
│  │  (memória)   │   │ deriválás    │   │ kulcs decrypt│ │
│  └─────────────┘   └──────────────┘   └──────┬───────┘ │
│                                               │         │
│  ┌─────────────┐   ┌──────────────┐          │         │
│  │ Üzenet      │<──│ AES kulcs    │<─────────┘         │
│  │ visszafejtés│   │ unwrap (RSA) │                    │
│  └─────────────┘   └──────────────┘                    │
│                                                         │
│  Plaintext SOHA nem hagyja el a böngészőt               │
│  (kivéve: OpenAI API hívás inferencia közben)           │
└────────────────────────┬────────────────────────────────┘
                         │ HTTPS
┌────────────────────────▼────────────────────────────────┐
│                      SZERVER                            │
│                                                         │
│  Next.js API Routes                                     │
│  ┌──────────────────────────────────────────────┐       │
│  │ • Fogadja a plaintext üzenetet               │       │
│  │ • Elküldi az OpenAI API-nak (streaming SSE)  │       │
│  │ • Visszakapja a választ                      │       │
│  │ • TITKOSÍTJA mindkettőt (AES-256-GCM)       │       │
│  │ • AES kulcsot RSA pub key-vel WRAPOLJA       │       │
│  │ • Csak ciphertext-et tárol az adatbázisban   │       │
│  │ • Eldobja a plaintext-et és az AES kulcsot   │       │
│  └──────────────────────────────────────────────┘       │
│                                                         │
│  SQLite adatbázis: KIZÁRÓLAG titkosított adatok         │
└─────────────────────────────────────────────────────────┘
```

---

## Tech Stack

| Komponens | Technológia |
|---|---|
| Framework | Next.js 14 (App Router) |
| Nyelv | TypeScript 5.6 |
| Adatbázis | SQLite (fejlesztés) / PostgreSQL (produkció) |
| ORM | Prisma 5.22 |
| AI | OpenAI SDK 4.73 (streaming SSE) |
| Stílus | Tailwind CSS 3.4 + CSS custom properties |
| Titkosítás | WebCrypto API (böngésző) + Node.js crypto (szerver) |
| Autentikáció | Cookie-alapú session, bcrypt jelszó hash |
| Validáció | Zod |
| Markdown | react-markdown + remark-gfm + react-syntax-highlighter |

---

## Titkosítási architektúra

### Kulcshierarchia

```
Jelszó (felhasználó fejében)
    │
    ▼
PBKDF2 (200.000 iteráció, SHA-256, random salt)
    │
    ▼
KEK (Key Encryption Key) — AES-256-GCM kulcs
    │
    ▼
Titkosított RSA privát kulcs (szerveren tárolva)
    │
    ▼
RSA-2048-OAEP kulcspár
    ├── Publikus kulcs (szerveren, plaintext SPKI)
    └── Privát kulcs (szerveren, KEK-kel titkosítva)

Per-üzenet titkosítás:
    AES-256-GCM kulcs (random, egyszer használatos)
        │
        ├── Üzenet tartalma → AES-GCM titkosítás → contentEnc
        └── AES kulcs → RSA publikus kulccsal wrap → sealedKeyB64
```

### Regisztráció (kliens-oldal, böngészőben)

1. Generál egy random 16 byte-os **salt**-ot
2. A felhasználó jelszavából + salt-ból **PBKDF2**-vel (200.000 iteráció, SHA-256) derivál egy **KEK**-et (AES-256-GCM kulcs)
3. Generál egy **RSA-2048 OAEP (SHA-256)** kulcspárt a böngészőben
4. A publikus kulcsot SPKI formátumban exportálja (base64)
5. A privát kulcsot PKCS#8 formátumban exportálja, majd a KEK-kel titkosítja (AES-256-GCM)
6. A szerverre küldi: `{ email, password, encryptionSalt, publicKeySpkiB64, privateKeyEncB64 }`
7. A szerver **soha nem látja** a plaintext privát kulcsot — csak a KEK-kel titkosított változatot tárolja

### Vault feloldás (bejelentkezés után)

1. Lekéri a `/api/me`-ből a felhasználó `encryptionSalt` és KDF paramétereit
2. Lekéri a `/api/keys/status`-ból a titkosított privát kulcsot (`privateKeyEncB64`)
3. Újra deriválja a KEK-et a jelszóból + salt-ból PBKDF2-vel
4. Visszafejti a privát kulcsot: `decryptWithKek(privateKeyEncB64, kek)` → nyers PKCS#8
5. Importálja mint `CryptoKey` (RSA-OAEP, decrypt-only)
6. A `CryptoKey` React context-ben él — a vault "nyitva" van

### Üzenet titkosítás (szerver-oldal, üzenet mentéskor)

1. Generál egy friss random **32 byte-os AES kulcsot** üzenetenként
2. Az AES kulcsot **wrap-olja** a felhasználó RSA publikus kulcsával: `RSA-OAEP encrypt(pubKey, aesKey)` → `sealedKeyB64`
3. A plaintext-et **titkosítja** AES-256-GCM-mel: `aesGcmEncrypt(aesKey, plaintext)` → `contentEnc`
4. Tárolja: `{ contentEnc, sealedKeyB64 }` az adatbázisban
5. **Eldobja** az AES kulcsot — visszaállítani csak a privát kulccsal lehet

### Üzenet visszafejtés (kliens-oldal, böngészőben)

1. Az RSA privát kulccsal (memóriában) **unwrap-olja** a sealed AES kulcsot
2. AES-GCM-mel visszafejti a tartalmat → plaintext UTF-8 string

### Titkosított adat formátum

Minden titkosított mező (`contentEnc`, `titleEnc`, `privateKeyEncB64`) azonos formátumot követ:

```
base64( IV[12 byte] || AuthTag[16 byte] || Ciphertext[N byte] )
```

---

## Stealth mód (álcázás)

A stealth mód egy **plausible deniability** (hihető tagadhatóság) funkció. Alapértelmezetten az alkalmazás csak ártalmatlan "álca" beszélgetéseket mutat (időjárás, sport). A valódi beszélgetések csak egy titkos kód beírásával jelennek meg.

### Működés

1. **Alapállapot**: A sidebar kizárólag `isDecoy: true` beszélgetéseket mutat
2. **Feloldás**: A felhasználó begépeli a titkos kódot a chat input mezőbe
3. **Kód detektálás**: A kliens minden billentyűleütésnél ellenőrzi:
   - Ha az input hossza megegyezik a kód hosszával → SHA-256 hash-t számol
   - Ha a hash egyezik a szerveren tárolt hash-sel → feloldás
   - Az input törlődik (a kód soha nem marad látható)
   - Nincs hálózati kérés billentyűleütésenként — csak az induláskori config betöltés
4. **Feloldás után**: Minden beszélgetés megjelenik + egy piros **HIDE** gomb a sidebar tetején
5. **HIDE gomb**: Azonnal visszarejti a valódi beszélgetéseket
6. **Új beszélgetések**: Stealth zárt állapotban automatikusan `isDecoy: true`, nyitott állapotban `isDecoy: false`

### Konfiguráció

A `.env` fájlban:
```
STEALTH_CODE="vault"
```

Az első betöltéskor, ha nincs álca beszélgetés, automatikusan seed-eli 2 darab realisztikus decoy-t (időjárás, sport).

---

## Adatbázis séma

### User
| Mező | Típus | Leírás |
|---|---|---|
| id | UUID | Elsődleges kulcs |
| email | String (unique) | Felhasználó email |
| passwordHash | String | bcrypt hash |
| encryptionSalt | String | PBKDF2 salt (base64) |
| publicKeySpkiB64 | String | RSA publikus kulcs (SPKI, base64) |
| privateKeyEncB64 | String | RSA privát kulcs (KEK-kel titkosítva) |
| keyVersion | Int | Kulcs verzió (migrációhoz) |
| keysStatus | String | "missing" / "ready" |
| encryptionPasswordMode | String | "same_as_login" / "custom" |
| openaiApiKeyEnc | String? | (jövőbeli) Titkosított saját API kulcs |

### Session
| Mező | Típus | Leírás |
|---|---|---|
| id | UUID | Elsődleges kulcs |
| userId | String | FK → User |
| tokenHash | String | Session token SHA-256 hash-e |
| expiresAt | DateTime | Lejárat (30 nap) |

### Conversation
| Mező | Típus | Leírás |
|---|---|---|
| id | UUID | Elsődleges kulcs |
| userId | String | FK → User |
| titleEnc | String? | Titkosított cím |
| sealedKeyB64 | String | RSA-wrapped AES kulcs a címhez |
| model | String | AI modell (default: gpt-5.5) |
| isDecoy | Boolean | Stealth álca beszélgetés? |

### Message
| Mező | Típus | Leírás |
|---|---|---|
| id | UUID | Elsődleges kulcs |
| conversationId | String | FK → Conversation |
| role | String | "user" / "assistant" / "system" |
| contentEnc | String | Titkosított üzenet tartalom |
| sealedKeyB64 | String | RSA-wrapped AES kulcs |
| tokenCount | Int? | Token szám (költség tracking) |
| model | String? | Melyik modell válaszolt |

### UploadedFile
| Mező | Típus | Leírás |
|---|---|---|
| id | UUID | Elsődleges kulcs |
| userId | String | FK → User |
| conversationId | String? | FK → Conversation |
| filenameEnc | String | Titkosított fájlnév |
| contentEnc | String | Titkosított fájl tartalom |
| sealedKeyB64 | String | RSA-wrapped AES kulcs |

---

## API végpontok

### Autentikáció
| Végpont | Metódus | Leírás |
|---|---|---|
| `/api/auth/register` | POST | Regisztráció + kliens-generált titkosítási kulcsok tárolása |
| `/api/auth/login` | POST | Bejelentkezés (bcrypt ellenőrzés, session cookie létrehozás) |
| `/api/auth/logout` | POST | Session törlés, cookie törlés |

### Felhasználó és kulcsok
| Végpont | Metódus | Leírás |
|---|---|---|
| `/api/me` | GET | Felhasználó profil + KDF paraméterek (salt, iteráció szám) |
| `/api/keys/status` | GET | Titkosítási kulcsok állapota + titkosított privát kulcs |
| `/api/keys/register` | POST | Publikus + titkosított privát kulcs tárolása (egyszeri) |

### Chat és beszélgetések
| Végpont | Metódus | Leírás |
|---|---|---|
| `/api/chat` | POST | Üzenet küldés OpenAI-nak (SSE streaming), titkosított tárolás |
| `/api/conversations` | GET | Beszélgetés lista (titkosított címek + metaadatok) |
| `/api/conversations` | POST | Új beszélgetés létrehozása |
| `/api/conversations/[id]` | GET | Egy beszélgetés metaadatai |
| `/api/conversations/[id]` | PATCH | Cím frissítés (újra-titkosítva) vagy modell váltás |
| `/api/conversations/[id]` | DELETE | Beszélgetés + üzenetek törlése (cascade) |
| `/api/conversations/[id]/messages` | GET | Beszélgetés üzenetei (titkosítva) |

### Stealth mód
| Végpont | Metódus | Leírás |
|---|---|---|
| `/api/stealth/config` | GET | Stealth mód állapota (hash + kód hossz) |
| `/api/stealth/seed` | POST | Álca beszélgetések generálása |

---

## Frontend komponensek

| Komponens | Fájl | Funkció |
|---|---|---|
| Root layout | `app/layout.tsx` | VaultUnlockProvider wrapper |
| Root page | `app/page.tsx` | Redirect → `/chat` vagy `/login` |
| Login | `app/login/page.tsx` | Bejelentkezés, jelszó sessionStorage-ba auto-unlock-hoz |
| Register | `app/register/page.tsx` | Regisztráció, RSA kulcspár generálás böngészőben |
| Chat layout | `app/chat/layout.tsx` | Auth guard (redirect ha nincs session) |
| ChatPage | `app/chat/page.tsx` | Fő orchestrátor: stealth, sidebar, beszélgetés lista |
| VaultGate | `app/chat/VaultGate.tsx` | Vault feloldás képernyő (jelszó prompt / auto-unlock) |
| ChatView | `app/chat/ChatView.tsx` | Chat UI: modell választó, streaming, üzenet visszafejtés |
| ChatInput | `app/chat/ChatInput.tsx` | Input mező + stealth kód detektálás |
| ChatMessage | `app/chat/ChatMessage.tsx` | Üzenet megjelenítés (markdown, kód, szerkesztés) |
| ChatSidebar | `app/chat/ChatSidebar.tsx` | Sidebar: beszélgetés lista, átnevezés, törlés, HIDE gomb |
| CodeBlock | `app/chat/CodeBlock.tsx` | Szintaxis kiemelés (Prism, oneDark) |
| PasswordInput | `app/components/ui/PasswordInput.tsx` | Jelszó mező show/hide togglevel |
| VaultUnlockProvider | `app/components/security/VaultUnlockProvider.tsx` | React context: vault állapot + privát kulcs memóriában |

---

## Biztonsági modell

### Mit véd a rendszer?
- **Adatbázis kiszivárgás**: Ha valaki hozzáfér a DB-hez, csak titkosított blobokat lát
- **Szerver kompromittálás**: A szerver operátor nem tudja olvasni a tárolt beszélgetéseket
- **Fizikai hozzáférés (stealth)**: Aki ránéz a képernyőre, csak ártalmatlan beszélgetéseket lát

### Mit NEM véd?
- **Aktív OpenAI inferencia**: Az üzenet plaintext-ként utazik az OpenAI API-hoz — ez szükséges a működéshez
- **Böngésző memória**: A privát kulcs a böngésző memóriájában él amíg a vault nyitva van
- **Keylogger / screen capture**: Kliens-oldali malware ellen nincs védelem
- **Brute force**: A PBKDF2 200.000 iteráció + rate limiting lassítja, de nem teszi lehetetlenné

### Rate limiting
- Login: 30 próbálkozás / IP / 15 perc + 10 próbálkozás / email / 15 perc
- Regisztráció: 5 próbálkozás / IP / 15 perc
- Chat: 30 üzenet / felhasználó / perc

---

## Fájlstruktúra

```
app/
├── layout.tsx                          # Root layout + VaultUnlockProvider
├── page.tsx                            # Redirect
├── globals.css                         # CSS változók + utility class-ok
├── login/page.tsx                      # Login oldal
├── register/page.tsx                   # Regisztráció + kulcs generálás
├── chat/
│   ├── layout.tsx                      # Auth guard
│   ├── page.tsx                        # Chat orchestrátor + stealth
│   ├── VaultGate.tsx                   # Vault feloldás UI
│   ├── ChatView.tsx                    # Chat fő nézet
│   ├── ChatInput.tsx                   # Input + stealth detektálás
│   ├── ChatMessage.tsx                 # Üzenet renderelés
│   ├── ChatSidebar.tsx                 # Sidebar + HIDE gomb
│   └── CodeBlock.tsx                   # Kód blokkok
├── components/
│   ├── security/VaultUnlockProvider.tsx # Vault context
│   └── ui/PasswordInput.tsx            # Password input
└── api/
    ├── auth/{login,register,logout}/   # Autentikáció
    ├── chat/route.ts                   # OpenAI streaming + titkosítás
    ├── conversations/                  # CRUD beszélgetésekhez
    ├── keys/{status,register}/         # Kulcs kezelés
    ├── me/route.ts                     # Felhasználó profil
    └── stealth/{config,seed}/          # Stealth mód

lib/
├── prisma.ts                           # Prisma singleton
├── session.ts                          # Session kezelés (hash-elt token, cookie)
├── rate-limit.ts                       # In-memory rate limiter
├── sealed-encryption.ts                # Szerver-oldali AES-GCM + RSA wrap
└── crypto/client-crypto.ts             # Kliens-oldali WebCrypto (KEK, RSA, AES)

prisma/
└── schema.prisma                       # Adatbázis séma (5 model)
```

---

## Környezeti változók (.env)

| Kulcs | Leírás |
|---|---|
| `DATABASE_URL` | Prisma connection string (`file:./dev.db` vagy PostgreSQL URL) |
| `OPENAI_API_KEY` | OpenAI API kulcs |
| `STEALTH_CODE` | (opcionális) Stealth mód titkos kód — ha nincs megadva, stealth kikapcsolva |

---

## Elérhető AI modellek

A ChatView-ban választható modellek:
- GPT-5.5 (alapértelmezett)
- GPT-5.5 Pro
- GPT-5.4
- GPT-5
- GPT-4.1
- GPT-4o
- o4-mini
- o3

A kiválasztott modell `localStorage`-ban megmarad session-ök között.

---

## Keyboard shortcut-ok

| Billentyű | Funkció |
|---|---|
| `Ctrl+Shift+O` | Új beszélgetés |
| `Ctrl+Shift+S` | Sidebar toggle |
| `Escape` | Streaming leállítás |
| Dupla klikk (sidebar) | Beszélgetés átnevezés |

---

*Utolsó frissítés: 2026. május 13.*
