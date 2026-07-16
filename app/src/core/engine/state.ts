/** Runtime state — never persisted (see docs/data-model.md), reset per run. */

export interface TimecodeSlotState {
  hrs: string;
  mins: string;
  secs: string;
  mili: string;
  running: boolean;
  cleared: boolean;
}

export interface RuntimeState {
  /** Current MA3 executor page, tracked via /updatePage/current. */
  page: number;
  /** The attribute "current" resolves to (attributeSelect modifiers set it). */
  attribute: string;
  encoderFine: boolean;
  encoderRough: boolean;
  deskLocked: boolean;
  /** Per relative-encoder assignment: 0-100, keyed `${mappingId}/${controlId}`. */
  accumulators: Map<string, number>;
  timecode: {
    /** 0 = none, 1-8 = slot; shared across devices exactly like v1. */
    selectedSlot: number;
    slots: Map<number, TimecodeSlotState>;
    holdTimer: ReturnType<typeof setTimeout> | undefined;
  };
}

export function createRuntimeState(): RuntimeState {
  return {
    page: 1,
    attribute: "dimmer",
    encoderFine: false,
    encoderRough: false,
    deskLocked: false,
    accumulators: new Map(),
    timecode: { selectedSlot: 0, slots: new Map(), holdTimer: undefined },
  };
}

export function accumulatorKey(mappingId: string, controlId: string): string {
  return `${mappingId}/${controlId}`;
}
