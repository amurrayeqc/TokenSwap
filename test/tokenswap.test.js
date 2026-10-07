const { TokenSwap } = require('../dist/tokenswap');

describe('TokenSwap', () => {
    test('executes and records completed work', async () => {
        const app = new TokenSwap();
        const result = await app.execute();

        expect(result.success).toBe(true);
        expect(result.data).toMatchObject({ processed: 1, status: 'completed' });
        expect(app.getStatistics()).toMatchObject({ processed: 1 });
    });
});
