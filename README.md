# Ritual Scrapbook

Ritual Scrapbook is an interactive, book-style dapp on Ritual testnet where users:
- connect wallet
- add username and PFP
- write a story page
- sign and submit onchain
- view community pages one-by-one

## Setup

1. Install dependencies

```bash
npm install
```

2. Copy env template

```bash
cp .env.example .env.local
```

3. Fill `.env.local`

- `X_BEARER_TOKEN`: X API bearer token (optional if you use manual form input only)
- `NEXT_PUBLIC_SCRAPBOOK_CONTRACT_ADDRESS`: scrapbook contract address (optional)
- `NEXT_PUBLIC_SCRAPBOOK_RECEIVER_ADDRESS`: fallback receiver address for fee transfer (optional)

4. Run app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Notes

- Network: Ritual Chain (`1979`)
- RPC: `https://rpc.ritualfoundation.org`
- Explorer: `https://explorer.ritualfoundation.org`
