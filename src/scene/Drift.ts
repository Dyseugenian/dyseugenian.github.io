import { Spring } from '../core/Spring';

const CHANNELS = {
  x: { breath: 0.5, settle: 1.2, sway: 1 },
  y: { breath: 0.35, settle: 0.8, sway: 0 },
  pitch: { breath: 0.035, settle: 0.06, sway: 0 },
  yaw: { breath: 0.045, settle: 0.07, sway: -0.035 },
  roll: { breath: 0.035, settle: 0.045, sway: 0.08 },
};
const BREATH_FREQUENCY = { min: 0.1, max: 0.25 };
const SETTLE_PAUSE = { min: 2.5, max: 6 };
const SWAY_PAUSE = { min: 6, max: 14 };
const SWAY_LENGTH = { min: 6, max: 10 };
const SWAY_FREQUENCY = 0.18;
const ZOOM = { degrees: 3, frequency: 0.07 };
const PACE = { range: 0.15, frequency: 0.03 };

type Range = { min: number; max: number };
type Name = keyof typeof CHANNELS;
export type Pose = Record<Name, number> & { zoom: number; pace: number };

export function driftExtent(): Record<Name | 'zoom', number> {
  const extent = { zoom: ZOOM.degrees } as Record<Name | 'zoom', number>;
  for (const [name, { breath, settle, sway }] of Object.entries(CHANNELS)) {
    extent[name as Name] = breath + settle + Math.abs(sway);
  }
  return extent;
}

export const STILL: Pose = { x: 0, y: 0, pitch: 0, yaw: 0, roll: 0, zoom: 0, pace: 1 };

function between({ min, max }: Range): number {
  return min + Math.random() * (max - min);
}

function wave(time: number, frequency: number, phase: number): number {
  return Math.sin(2 * Math.PI * frequency * time + phase);
}

class Channel {
  private frequencies = [between(BREATH_FREQUENCY), between(BREATH_FREQUENCY)];
  private phases = [Math.random() * 2 * Math.PI, Math.random() * 2 * Math.PI];
  private aim = new Spring(2.5, 3.2);
  private settled = new Spring(2.5, 3.2);
  private untilSettle = between(SETTLE_PAUSE);

  constructor(private amplitude: (typeof CHANNELS)[Name]) {}

  update(dt: number, time: number, sway: number): number {
    this.untilSettle -= dt;
    if (this.untilSettle <= 0) {
      this.aim.target = (Math.random() * 2 - 1) * this.amplitude.settle;
      this.untilSettle = between(SETTLE_PAUSE);
    }
    this.settled.target = this.aim.update(dt);
    const breath =
      0.6 * wave(time, this.frequencies[0]!, this.phases[0]!) +
      0.4 * wave(time, this.frequencies[1]!, this.phases[1]!);
    return breath * this.amplitude.breath + this.settled.update(dt) + sway * this.amplitude.sway;
  }
}

export class Drift {
  private channels = Object.entries(CHANNELS).map(
    ([name, amplitude]) => [name as Name, new Channel(amplitude)] as const,
  );
  private pose: Pose = { ...STILL };
  private time = 0;
  private untilSway = between(SWAY_PAUSE);
  private swayAge = 0;
  private swayLength = 0;
  private phase = Math.random() * 2 * Math.PI;

  update(dt: number): Pose {
    this.time += dt;
    this.untilSway -= dt;
    if (this.untilSway <= 0) {
      this.swayAge = 0;
      this.swayLength = between(SWAY_LENGTH);
      this.untilSway = this.swayLength + between(SWAY_PAUSE);
    }
    let sway = 0;
    if (this.swayAge < this.swayLength) {
      const envelope = Math.sin((Math.PI * this.swayAge) / this.swayLength) ** 4;
      sway = envelope * wave(this.swayAge, SWAY_FREQUENCY, 0);
      this.swayAge += dt;
    }
    for (const [name, channel] of this.channels) {
      this.pose[name] = channel.update(dt, this.time, sway);
    }
    this.pose.zoom = ZOOM.degrees * wave(this.time, ZOOM.frequency, this.phase);
    this.pose.pace = 1 + PACE.range * wave(this.time, PACE.frequency, 2 * this.phase);
    return this.pose;
  }
}
