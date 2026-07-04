// mirrors Go structs sent over Wails
export interface Message {
  topic: string;
  payload: string; // base64 (Go []byte at runtime)
  qos: number;
  retained: boolean;
  timestamp: string;
  contentType?: string;
  responseTopic?: string;
  userProps?: { key: string; value: string }[];
}

export interface TreeNode {
  name: string;
  fullTopic: string;
  children?: TreeNode[];
  messageCount: number;
  lastPayload?: string; // base64
  lastSeen: string;
  retained: boolean;
}

export type Status = "disconnected" | "connecting" | "connected" | "reconnecting";
export interface StatusEvent { state: Status; attempt: number; reason: string }
