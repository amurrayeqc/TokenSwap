import { promises as fs } from 'node:fs';
import minimist, { ParsedArgs } from 'minimist';
import { QuoteRequest, TokenSwap } from './tokenswap';

interface Args extends ParsedArgs { input?: string; output?: string; router?: string; recipient?: string; deadline?: number; }

export async function main(argv = process.argv.slice(2)): Promise<number> {
    try {
        const args = minimist<Args>(argv, { string: ['input', 'output', 'router', 'recipient'], alias: { i: 'input', o: 'output' } });
        if (!args.input) throw new Error('Usage: tokenswap --input quote.json [--router 0x... --recipient 0x... --deadline UNIX] [--output result.json]');
        const request = JSON.parse(await fs.readFile(args.input, 'utf8')) as QuoteRequest;
        const engine = new TokenSwap(); const quote = engine.quote(request);
        const transaction = args.router || args.recipient || args.deadline ? engine.buildTransaction(quote, String(args.router || ''), String(args.recipient || ''), Number(args.deadline)) : undefined;
        const result = { quote, transaction }; const rendered = `${JSON.stringify(result, null, 2)}\n`;
        if (args.output) await fs.writeFile(args.output, rendered, 'utf8'); else process.stdout.write(rendered);
        return 0;
    } catch (error) { console.error(error instanceof Error ? error.message : error); return 1; }
}

if (require.main === module) void main().then(code => { process.exitCode = code; });
