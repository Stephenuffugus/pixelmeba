/**
 * The canonical update order (SPEC §3.2). Each stage resolves completely before the next.
 * Stages that belong to later phases are present as no-ops so the order never changes.
 */
import { stageBirths } from './births';
import { stageCommands } from './commands';
import { stageIntake } from './intake';
import { stageMaintenance } from './maintenance';
import { stageSenseAndMove } from './movement';
import { stagePublish } from './publish';
import { stageEnvironment } from './transport';
import { stageConversion } from './conversion';
import { stageContacts } from './contacts';
import { stageStructures } from './structures';
import type { World } from './world';

export interface StepHooks {
  /** Called after every stage (tests use it to observe ordering). */
  afterStage?: (stage: number, world: World) => void;
}

export function step(world: World, hooks: StepHooks = {}): void {
  const after = hooks.afterStage;
  stageCommands(world);
  after?.(1, world);
  stageEnvironment(world);
  after?.(2, world);
  stageConversion(world);
  after?.(3, world);
  stageSenseAndMove(world);
  after?.(4, world);
  stageContacts(world);
  after?.(5, world);
  stageIntake(world);
  after?.(6, world);
  stageMaintenance(world);
  after?.(7, world);
  stageStructures(world);
  after?.(8, world);
  stageBirths(world);
  after?.(9, world);
  stagePublish(world);
  after?.(10, world);
  world.tick++;
}

export function run(world: World, ticks: number, hooks: StepHooks = {}): void {
  for (let t = 0; t < ticks; t++) step(world, hooks);
}
