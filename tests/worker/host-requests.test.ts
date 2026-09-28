/** Host request routing: an unknown request type fails once with an error reply (it used to bounce
 * between handle() and handleAsync() without end). */
import { describe, expect, it } from 'vitest';
import { DishHost } from '../../src/worker/host';
import type { FromWorker, ToWorker } from '../../src/worker/protocol';
import { registry } from '../helpers/world';

describe('host request routing', () => {
  it('answers an unknown request type with one error and keeps serving', async () => {
    const out: FromWorker[] = [];
    const host = new DishHost(registry(), (m) => out.push(m), { now: () => 0 });
    host.handle({ type: 'no-such-request', requestId: 7 } as unknown as ToWorker);
    await new Promise((r) => setTimeout(r, 20));
    const errors = out.filter((m) => m.type === 'error');
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({ requestId: 7, message: 'unknown request no-such-request' });
    host.handle({ type: 'create', requestId: 8, dishId: 'd', source: { kind: 'recipe', recipeId: 'FIRST_DISH_V1' } });
    expect(out.some((m) => m.type === 'ready' && m.requestId === 8)).toBe(true);
  });
});
