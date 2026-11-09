export type Branch =
  | {
      kind: "named";
      name: string;
    }
  | {
      kind: "detached";
    }
  | {
      kind: "unavailable";
    };
export type Directory =
  | {
      kind: "known";
      path: string;
    }
  | {
      kind: "multiple";
    }
  | {
      kind: "unavailable";
    };
export type Context =
  | {
      kind: "workspace";
    }
  | {
      id: string;
      kind: "voyage";
    }
  | {
      id: string;
      kind: "fleet";
    }
  | {
      id: string;
      kind: "vessel";
    }
  | {
      id: string;
      kind: "portal";
    };

export interface Facts {
  branch: Branch;
  directory: Directory;
  path: string[];
  scope: Context;
  version: string;
}
