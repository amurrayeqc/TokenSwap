export interface PoolSnapshot {
    address: string;
    token0: string;
    token1: string;
    reserve0: string;
    reserve1: string;
    feeBps?: number;
}

export interface QuoteRequest {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    pools: PoolSnapshot[];
    maxHops?: number;
    slippageBps?: number;
}

export interface RouteHop {
    pool: string;
    tokenIn: string;
    tokenOut: string;
    reserveIn: string;
    reserveOut: string;
    amountIn: string;
    amountOut: string;
    feeBps: number;
}

export interface SwapQuote {
    tokenIn: string;
    tokenOut: string;
    amountIn: string;
    amountOut: string;
    minimumAmountOut: string;
    slippageBps: number;
    priceImpactBps: number;
    path: string[];
    hops: RouteHop[];
}

const ADDRESS = /^0x[0-9a-fA-F]{40}$/;
const UINT256_MAX = (2n ** 256n) - 1n;

function address(value: string, name: string): string {
    if (!ADDRESS.test(value || '')) throw new Error(`${name} must be a 20-byte Ethereum address`);
    return value.toLowerCase();
}

function uint(value: string, name: string): bigint {
    if (!/^(0|[1-9]\d*)$/.test(String(value))) throw new Error(`${name} must be an unsigned integer string`);
    const parsed = BigInt(value);
    if (parsed > UINT256_MAX) throw new Error(`${name} exceeds uint256`);
    return parsed;
}

function bps(value: number | undefined, fallback: number, name: string, max = 10000): number {
    const parsed = value ?? fallback;
    if (!Number.isInteger(parsed) || parsed < 0 || parsed > max) throw new Error(`${name} must be an integer from 0 to ${max}`);
    return parsed;
}

export function quotePool(amountIn: bigint, reserveIn: bigint, reserveOut: bigint, feeBps = 30): bigint {
    if (amountIn <= 0n) throw new Error('amountIn must be greater than zero');
    if (reserveIn <= 0n || reserveOut <= 0n) throw new Error('pool reserves must be greater than zero');
    const feeMultiplier = BigInt(10000 - bps(feeBps, 30, 'feeBps', 9999));
    const amountInWithFee = amountIn * feeMultiplier;
    return (amountInWithFee * reserveOut) / (reserveIn * 10000n + amountInWithFee);
}

interface Edge { pool: PoolSnapshot; tokenIn: string; tokenOut: string; reserveIn: bigint; reserveOut: bigint; feeBps: number; }

function normalizePools(pools: PoolSnapshot[]): Edge[] {
    if (!Array.isArray(pools) || pools.length === 0) throw new Error('at least one pool snapshot is required');
    const addresses = new Set<string>(); const edges: Edge[] = [];
    for (const [index, raw] of pools.entries()) {
        const pool = address(raw.address, `pools[${index}].address`); const token0 = address(raw.token0, `pools[${index}].token0`); const token1 = address(raw.token1, `pools[${index}].token1`);
        if (token0 === token1) throw new Error(`pools[${index}] tokens must be different`);
        if (addresses.has(pool)) throw new Error(`duplicate pool address: ${pool}`); addresses.add(pool);
        const reserve0 = uint(raw.reserve0, `pools[${index}].reserve0`); const reserve1 = uint(raw.reserve1, `pools[${index}].reserve1`); const fee = bps(raw.feeBps, 30, `pools[${index}].feeBps`, 9999);
        if (reserve0 === 0n || reserve1 === 0n) throw new Error(`pools[${index}] reserves must be greater than zero`);
        const normalized = { ...raw, address: pool, token0, token1, reserve0: reserve0.toString(), reserve1: reserve1.toString(), feeBps: fee };
        edges.push({ pool: normalized, tokenIn: token0, tokenOut: token1, reserveIn: reserve0, reserveOut: reserve1, feeBps: fee });
        edges.push({ pool: normalized, tokenIn: token1, tokenOut: token0, reserveIn: reserve1, reserveOut: reserve0, feeBps: fee });
    }
    return edges;
}

export class AMMPathfinder {
    quote(request: QuoteRequest): SwapQuote {
        const tokenIn = address(request.tokenIn, 'tokenIn'); const tokenOut = address(request.tokenOut, 'tokenOut');
        if (tokenIn === tokenOut) throw new Error('tokenIn and tokenOut must be different');
        const amountIn = uint(request.amountIn, 'amountIn'); if (amountIn === 0n) throw new Error('amountIn must be greater than zero');
        const maxHops = request.maxHops ?? 3; if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 4) throw new Error('maxHops must be an integer from 1 to 4');
        const slippage = bps(request.slippageBps, 50, 'slippageBps', 5000); const edges = normalizePools(request.pools);
        let best: { amountOut: bigint; spotOut: bigint; hops: RouteHop[]; path: string[] } | undefined;

        const visit = (current: string, amount: bigint, spot: bigint, path: string[], hops: RouteHop[], usedPools: Set<string>) => {
            if (hops.length >= maxHops) return;
            for (const edge of edges) {
                if (edge.tokenIn !== current || usedPools.has(edge.pool.address) || path.includes(edge.tokenOut)) continue;
                const output = quotePool(amount, edge.reserveIn, edge.reserveOut, edge.feeBps); if (output === 0n) continue;
                const spotOutput = (spot * edge.reserveOut) / edge.reserveIn;
                const hop: RouteHop = { pool: edge.pool.address, tokenIn: edge.tokenIn, tokenOut: edge.tokenOut, reserveIn: edge.reserveIn.toString(), reserveOut: edge.reserveOut.toString(), amountIn: amount.toString(), amountOut: output.toString(), feeBps: edge.feeBps };
                const nextHops = [...hops, hop]; const nextPath = [...path, edge.tokenOut];
                if (edge.tokenOut === tokenOut && (!best || output > best.amountOut)) best = { amountOut: output, spotOut: spotOutput, hops: nextHops, path: nextPath };
                const nextUsed = new Set(usedPools); nextUsed.add(edge.pool.address); visit(edge.tokenOut, output, spotOutput, nextPath, nextHops, nextUsed);
            }
        };
        visit(tokenIn, amountIn, amountIn, [tokenIn], [], new Set());
        if (!best) throw new Error('no route found for the requested token pair');
        const chosen = best as { amountOut: bigint; spotOut: bigint; hops: RouteHop[]; path: string[] };
        const minimum = chosen.amountOut * BigInt(10000 - slippage) / 10000n;
        const impact = chosen.spotOut > chosen.amountOut && chosen.spotOut > 0n ? Number((chosen.spotOut - chosen.amountOut) * 10000n / chosen.spotOut) : 0;
        return { tokenIn, tokenOut, amountIn: amountIn.toString(), amountOut: chosen.amountOut.toString(), minimumAmountOut: minimum.toString(), slippageBps: slippage, priceImpactBps: impact, path: chosen.path, hops: chosen.hops };
    }

    buildTransaction(quote: SwapQuote, router: string, recipient: string, deadline: number): { to: string; data: string; value: string } {
        const to = address(router, 'router'); const receiver = address(recipient, 'recipient');
        if (!Number.isSafeInteger(deadline) || deadline <= Math.floor(Date.now() / 1000)) throw new Error('deadline must be a future Unix timestamp');
        const word = (value: bigint) => value.toString(16).padStart(64, '0');
        const addressWord = (value: string) => value.slice(2).toLowerCase().padStart(64, '0');
        const head = [word(uint(quote.amountIn, 'quote.amountIn')), word(uint(quote.minimumAmountOut, 'quote.minimumAmountOut')), word(160n), addressWord(receiver), word(BigInt(deadline))].join('');
        const tail = [word(BigInt(quote.path.length)), ...quote.path.map(token => addressWord(address(token, 'quote.path token')))].join('');
        return { to, data: `0x38ed1739${head}${tail}`, value: '0x0' };
    }
}

export const RouteQuarry = AMMPathfinder;
export const TokenSwap = AMMPathfinder;
