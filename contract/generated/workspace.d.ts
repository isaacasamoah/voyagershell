import type { Request } from "./request";
import type { Response } from "./response";
export function invoke(action: Request["action"], expectedVersion: Request["expectedVersion"]): Promise<Response>;
