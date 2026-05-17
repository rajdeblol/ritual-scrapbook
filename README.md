# Ritual Creator Tips

Tip any X creator on Ritual testnet with:
- real X username lookup
- real X profile picture pull
- manual tip amount input (no fixed tiers)

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

- `X_BEARER_TOKEN`: X API bearer token for user lookup
- `NEXT_PUBLIC_TIP_JAR_ADDRESS`: deployed `CreatorTipJar` contract address on Ritual

4. Run app

```bash
npm run dev
```

Open `http://localhost:3000`.

## Contract

Escrow contract source:
- `contracts/CreatorTipJar.sol`

Frontend calls this function:
- `tipCreator(string username, string xUserId, string profileImageUrl, string message)` with payable value

## Notes

- This version uses escrow model (option 1): tips accumulate in contract balance and are tracked per username.
- Creator claim flow (prove X ownership + withdraw) can be added next.
