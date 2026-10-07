# AMMPathfinder

[![CI](https://github.com/centxyz/AMMPathfinder/actions/workflows/ci.yml/badge.svg)](https://github.com/centxyz/AMMPathfinder/actions/workflows/ci.yml)

AMMPathfinder is a deterministic Uniswap-V2-compatible swap planner. It evaluates supplied constant-product pool snapshots, searches routes of up to four hops, selects the highest-output path, reports fees and price impact, applies a slippage floor, and can encode an unsigned `swapExactTokensForTokens` router transaction.

It never holds private keys, signs, broadcasts, or claims that a snapshot is current. Obtain trusted pool reserves at the intended block before relying on a quote.

## Install

```bash
git clone https://github.com/centxyz/AMMPathfinder.git
cd AMMPathfinder
npm install
npm run build
```

## Quote a route

`examples/quote.json` shows the input format. Amounts and reserves are integer atomic units; addresses identify tokens and pools.

```bash
npm start -- --input examples/quote.json
```

Write the result and include unsigned router calldata:

```bash
npm start -- --input examples/quote.json --output result.json \
  --router 0xYourV2Router --recipient 0xYourWallet --deadline 2000000000
```

The encoded selector is `swapExactTokensForTokens(uint256,uint256,address[],address,uint256)`. Review the route and refresh reserves immediately before signing with a separate wallet.

## Verify

```bash
npm test
```

Tests cover constant-product math, route optimization, reverse pairs, malformed inputs, missing routes, slippage, and calldata generation.

## License

MIT © cent
