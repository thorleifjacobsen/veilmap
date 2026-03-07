// types/index.ts — All shared TypeScript types

import type {
  Box as PrismaBox,
  BoxType as PrismaBoxType,
  Token as PrismaToken,
} from '@prisma/client';

export type BoxType = PrismaBoxType;

export type Box = Pick<
  PrismaBox,
  'id' | 'session_id' | 'name' | 'type' | 'x' | 'y' | 'w' | 'h' | 'color' | 'notes' | 'revealed' | 'sort_order'
>;

export type Token = Pick<PrismaToken, 'id' | 'session_id' | 'emoji' | 'color' | 'x' | 'y' | 'label'>;

export interface MapObject {
  id: string;
  name: string;
  src: string;
  x: number;
  y: number;
  w: number;
  h: number;
  zIndex: number;
  visible: boolean;
  locked: boolean;
}

export interface Session {
  id: string;
  slug: string;
  owner_id: string;
  name: string;
  map_url: string | null;
  prep_mode: boolean;
  prep_message: string;
  gm_fog_opacity: number;
  grid_size: number;
  boxes: Box[];
  tokens: Token[];
  objects: MapObject[];
}

export interface CameraViewport {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Viewport {
  x: number;
  y: number;
  scale: number;
}

// SSE event types sent from server to player display
export type SSEEventType =
  | 'state:full'
  | 'fog:paint'
  | 'fog:snapshot'
  | 'fog:reset'
  | 'box:reveal'
  | 'box:hide'
  | 'box:create'
  | 'box:update'
  | 'box:delete'
  | 'token:create'
  | 'token:move'
  | 'token:delete'
  | 'session:prep'
  | 'session:settings'
  | 'session:blackout'
  | 'camera:move'
  | 'objects:update'
  | 'ping';

export interface SSEEvent {
  type: SSEEventType;
  payload: unknown;
}

export interface FogPaintPayload {
  x: number; y: number;
  radius: number;
  mode: 'reveal' | 'hide';
}

export interface FogSnapshotPayload {
  png: string; // base64
}

export interface PingPayload {
  x: number; y: number;
}

export interface PrepPayload {
  active: boolean;
  message?: string;
}

export interface FogPaintBatchPayload {
  strokes: FogPaintPayload[];
}

export interface BlackoutPayload {
  active: boolean;
  message?: string;
}

export interface CameraMovePayload {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface FullStatePayload {
  session: Session;
  fogPng: string | null;
  objects: MapObject[];
  camera: CameraViewport | null;
}

// Session export format for free users
export interface SessionExport {
  version: 1;
  name: string;
  boxes: Omit<Box, 'id' | 'session_id'>[];
  tokens: Omit<Token, 'id' | 'session_id'>[];
  objects: Omit<MapObject, 'id'>[];
  settings: {
    gm_fog_opacity: number;
    grid_size: number;
    prep_message: string;
  };
}
