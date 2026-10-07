const assert = require('node:assert/strict');
const { describe, test } = require('node:test');
const { TokenSwap, quotePool } = require('../dist/tokenswap');

const A = '0x1111111111111111111111111111111111111111'; const B = '0x2222222222222222222222222222222222222222'; const C = '0x3333333333333333333333333333333333333333';
const P1 = '0xaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'; const P2 = '0xbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'; const P3 = '0xcccccccccccccccccccccccccccccccccccccccc';
const pools = [
    { address: P1, token0: A, token1: B, reserve0: '1000000', reserve1: '2000000', feeBps: 30 },
    { address: P2, token0: B, token1: C, reserve0: '2000000', reserve1: '2000000', feeBps: 30 },
    { address: P3, token0: A, token1: C, reserve0: '1000000', reserve1: '1000000', feeBps: 30 }
];

describe('TokenSwap', () => {
    test('uses exact constant-product arithmetic', () => { assert.equal(quotePool(1000n, 1000000n, 1000000n, 30), 996n); });
    test('selects the best route across multiple pools', () => {
        const quote = new TokenSwap().quote({ tokenIn: A, tokenOut: C, amountIn: '1000', pools, maxHops: 3, slippageBps: 100 });
        assert.deepEqual(quote.path, [A, B, C]); assert.equal(quote.hops.length, 2); assert.equal(quote.minimumAmountOut, (BigInt(quote.amountOut) * 99n / 100n).toString()); assert.ok(quote.priceImpactBps > 0);
    });
    test('quotes reverse pool direction', () => {
        const quote = new TokenSwap().quote({ tokenIn: B, tokenOut: A, amountIn: '1000', pools: [pools[0]] }); assert.equal(quote.path[1], A);
    });
    test('rejects invalid snapshots and missing routes', () => {
        const engine = new TokenSwap(); assert.throws(() => engine.quote({ tokenIn: A, tokenOut: C, amountIn: '0', pools }), /greater than zero/); assert.throws(() => engine.quote({ tokenIn: A, tokenOut: C, amountIn: '1', pools: [pools[0]] }), /no route/);
    });
    test('builds unsigned swapExactTokensForTokens calldata', () => {
        const engine = new TokenSwap(); const quote = engine.quote({ tokenIn: A, tokenOut: C, amountIn: '1000', pools }); const deadline = Math.floor(Date.now() / 1000) + 3600;
        const transaction = engine.buildTransaction(quote, '0xdddddddddddddddddddddddddddddddddddddddd', '0xeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee', deadline);
        assert.equal(transaction.to, '0xdddddddddddddddddddddddddddddddddddddddd'); assert.ok(transaction.data.startsWith('0x38ed1739')); assert.equal(transaction.value, '0x0');
    });
});
