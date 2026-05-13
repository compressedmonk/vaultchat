# VaultChat

Privacy-first AI workspace with client-side zero-access encryption. All conversation history and uploaded documents are encrypted in the browser before storage — the server never sees plaintext.

## Features

- **Zero-access encryption** — AES-256-GCM per-message encryption, RSA-OAEP key wrapping, PBKDF2 key derivation
- **ChatGPT-style UI** — streaming responses, markdown rendering, code blocks, dark mode
- **Model selection** — GPT-5.5, GPT-5.5 Pro, GPT-5, GPT-4.1, GPT-4o, o3, o4-mini
- **Auto-generated titles** — conversations get AI-generated encrypted titles
- **Separate encryption password** — optional distinct password for vault decryption
- **Client-side key management** — RSA keypair generated in browser, private key encrypted with password-derived KEK

## Tech Stack

- **Next.js 14** (App Router) + TypeScript
- **Tailwind CSS** — dark mode, premium minimal design
- **Prisma ORM** + SQLite (local dev) / PostgreSQL (production)
- **WebCrypto API** — all encryption/decryption happens in the browser
- **OpenAI API** — chat completions with streaming

## Getting Started

```bash
# Install dependencies
npm install

# Set up environment
cp .env.example .env
# Edit .env with your OpenAI API key

# Initialize database
npx prisma db push
npx prisma generate

# Start dev server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Environment Variables

| Variable | Description |
|---|---|
| `DATABASE_URL` | Database connection string (`file:./dev.db` for SQLite) |
| `OPENAI_API_KEY` | Your OpenAI API key |

## Security Model

- Server stores only ciphertext, IVs, and wrapped keys
- Password never leaves the browser
- Each message has its own AES key, wrapped with the user's RSA public key
- Database breach exposes zero plaintext
- OpenAI sees plaintext only during active inference (acceptable tradeoff)

## License

Private — All rights reserved.
