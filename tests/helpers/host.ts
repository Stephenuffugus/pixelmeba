/**
 * Test helper: drive the real worker host (DishHost) with a fake clock, exactly as sim.worker.ts
 * does with postMessage, and read its replies synchronously.
 */
import type { CommandPayload, CommandResult } from '../../src/sim/commands';
import type { ContentRegistry } from '../../src/sim/content/registry';
import type { World } from '../../src/sim/world';
import { DishHost } from '../../src/worker/host';
import type { DishSource, FromWorker, Speed } from '../../src/worker/protocol';
import { registry } from './world';

export class FakeClockHost {
  /** Fake wall clock in milliseconds. */
  now = 0;
  readonly out: FromWorker[] = [];
  readonly host: DishHost;
  /** Most ticks any single pump ran (proves 4× really batches several ticks per frame). */
  maxTicksPerPump = 0;
  private dishId = '';
  private speed: Speed = 0;
  private req = 0;

  /** `reg`: the content the host builds dishes from (default: the shipped registry). */
  constructor(reg: ContentRegistry = registry()) {
    this.host = new DishHost(reg, (m) => this.out.push(m), { now: () => this.now });
  }

  create(dishId: string, source: DishSource): void {
    const requestId = ++this.req;
    this.host.handle({ type: 'create', requestId, dishId, source });
    const ready = this.out.find((m) => m.type === 'ready' && m.requestId === requestId);
    if (!ready) throw new Error(`dish ${dishId} was not created: ${JSON.stringify(this.out.filter((m) => m.type === 'error'))}`);
    this.dishId = dishId;
    this.speed = 0;
  }

  get world(): World {
    const w = this.host.world(this.dishId);
    if (!w) throw new Error(`no dish ${this.dishId}`);
    return w;
  }

  get tick(): number {
    return this.world.tick;
  }

  setSpeed(speed: Speed): void {
    this.host.handle({ type: 'setSpeed', dishId: this.dishId, speed });
    this.speed = speed;
  }

  /** One frame: advance the fake clock by `ms` and pump. Returns the ticks the host ran. */
  pump(ms: number): number {
    const before = this.tick;
    this.now += ms;
    this.host.pump();
    const ran = this.tick - before;
    if (ran > this.maxTicksPerPump) this.maxTicksPerPump = ran;
    return ran;
  }

  /**
   * Run at the current speed until the dish reaches `target` exactly. At 1× frames are 16 ms (never
   * more than one tick per frame); at 2×/4× each frame is sized to the ticks still needed (≤ 4).
   */
  advanceTo(target: number): void {
    if (this.speed === 0) throw new Error('advanceTo while paused');
    while (this.tick < target) {
      const remaining = target - this.tick;
      const ms = this.speed === 1 ? 16 : (Math.min(remaining, 4) * 100) / this.speed;
      this.pump(ms);
      if (this.tick > target) throw new Error(`host overshot tick ${target} (now ${this.tick})`);
    }
  }

  /** Send one gesture exactly as the UI does (undoable, so the host also snapshots for undo). */
  command(commandId: string, payload: CommandPayload, undoable = true): CommandResult | null {
    const requestId = ++this.req;
    this.host.handle({ type: 'command', requestId, dishId: this.dishId, commandId, payload, undoable });
    const ack = this.out.find((m) => m.type === 'ack' && m.requestId === requestId);
    if (!ack || ack.type !== 'ack') throw new Error(`command ${commandId} was not acknowledged`);
    return ack.result;
  }

  hash(): string {
    const requestId = ++this.req;
    this.host.handle({ type: 'hash', requestId, dishId: this.dishId });
    const msg = this.out.find((m) => m.type === 'hash' && m.requestId === requestId);
    if (!msg || msg.type !== 'hash') throw new Error('no hash reply');
    return msg.hash;
  }

  /** The host's in-memory save (serialized world JSON). */
  save(): string {
    const requestId = ++this.req;
    this.host.handle({ type: 'save', requestId, dishId: this.dishId });
    const msg = this.out.find((m) => m.type === 'saved' && m.requestId === requestId);
    if (!msg || msg.type !== 'saved') throw new Error('no save reply');
    return msg.json;
  }

  errors(): FromWorker[] {
    return this.out.filter((m) => m.type === 'error');
  }
}
