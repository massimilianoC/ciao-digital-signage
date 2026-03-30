export type ZoneContentType = "playlist" | "content" | "layout";

export interface ZoneContent {
  type: ZoneContentType;
  refId: string;
  label: string;
}

export interface LayoutZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  label?: string;
  content?: ZoneContent;
  backgroundImage?: string;
  padding?: number;
  borderRadius?: number;
  borderColor?: string;
  borderSize?: number;
  dropShadow?: boolean;
}

export interface Resolution {
  width: number;
  height: number;
}

export interface CompositeLayoutData {
  _id?: string;
  name: string;
  resolution: Resolution;
  zones: LayoutZone[];
  backgroundImage?: string;
}

export type LayoutImpactScope = "org" | "group" | "screen";
export type LayoutImpactLayer = "global" | "group" | "screen" | "force_override" | "no_content";

export interface LayoutImpactLayoutRef {
  id: string;
  name: string;
  direct: boolean;
  updatedAt: string;
  href: string;
}

export interface LayoutImpactScheduleRef {
  id: string;
  name: string;
  scope: LayoutImpactScope;
  scopeId: string;
  layoutId: string;
  layoutName: string;
  direct: boolean;
  updatedAt: string;
  href: string;
}

export interface LayoutImpactScreenRef {
  id: string;
  name: string;
  location?: string;
  groupName?: string;
  status: "online" | "offline" | "pending";
  lastSeenAt: string | null;
  effectiveLayer: LayoutImpactLayer;
  sourceScheduleName: string | null;
  sourcePlaylistName: string | null;
  sourceLayoutId: string | null;
  sourceLayoutName: string | null;
  href: string;
}

export interface LayoutImpactData {
  layoutId: string;
  layoutName: string;
  impactedLayoutIds: string[];
  nestedLayouts: LayoutImpactLayoutRef[];
  schedules: LayoutImpactScheduleRef[];
  screens: LayoutImpactScreenRef[];
  counts: {
    layout: number;
    schedule: number;
    screen: number;
  };
}
