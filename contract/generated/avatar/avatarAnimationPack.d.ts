export interface Pack {
  canvas: Canvas;
  clips: {
    [k: string]: Clip;
  };
  effects: {
    [k: string]: null;
  };
  id: string;
  images: {
    [k: string]: string;
  };
  poses: {
    [k: string]: Pose;
  };
  version: number;
}
export interface Canvas {
  /**
   * @minItems 2
   * @maxItems 2
   */
  anchor: [number, number];
  /**
   * @minItems 2
   * @maxItems 2
   */
  size: [number, number];
}
export interface Clip {
  /**
   * @minItems 4
   * @maxItems 4
   */
  easing: [number, number, number, number];
  /**
   * @maxItems 0
   */
  effects: [];
  from: string;
  steps: Step[];
}
export interface Step {
  fadeMs: number;
  holdMs: number;
  pose: string;
}
export interface Pose {
  /**
   * @minItems 2
   * @maxItems 2
   */
  anchor: [number, number];
  image: string;
  /**
   * @minItems 4
   * @maxItems 4
   */
  rect: [number, number, number, number];
  scale: number;
}
