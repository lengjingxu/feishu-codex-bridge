import { describe, expect, it } from 'vitest';
import { ProcessPool } from './process-pool';

describe('ProcessPool', () => {
  it('fills all newly available capacity after a runtime cap increase', async () => {
    let cap = 1;
    const pool = new ProcessPool(() => cap);
    const first = await pool.acquire();
    const second = pool.acquire();
    const third = pool.acquire();

    await Promise.resolve();
    cap = 3;
    first();
    await Promise.all([second, third]);

    expect(pool.snapshot()).toMatchObject({ active: 2, waiting: 0, cap: 3 });
    const releaseSecond = await second;
    const releaseThird = await third;
    releaseSecond();
    releaseThird();
  });
});
