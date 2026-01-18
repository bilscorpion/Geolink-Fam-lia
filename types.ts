
export interface GeoPoint {
  id: string;
  name: string;
  lat: number;
  lng: number;
  radius: number;
  link?: string;
  exitLink?: string;
  description?: string;
  isActive: boolean;
}

export interface UserLocation {
  lat: number;
  lng: number;
  accuracy: number;
}

export interface RemoteUser {
  id: string;
  name: string;
  color: string;
  lat: number;
  lng: number;
  lastSeen: number;
}

export interface ActivityLog {
  id: string;
  pointName: string;
  type: 'entry' | 'exit';
  timestamp: number;
}

export interface GroundingLink {
  uri: string;
  title: string;
}
