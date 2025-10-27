import { EventBus } from './EventBus';
import type { Game } from './Game';

export interface PresenceInfo {
  id: string;
  name: string;
  selection?: string;
  color: string;
}

export interface ChangeMessage {
  author: string;
  timestamp: number;
  payload: unknown;
}

export class CollaborationHub {
  readonly events = new EventBus();
  readonly presence = new Map<string, PresenceInfo>();
  private history: ChangeMessage[] = [];

  constructor(private readonly game: Game) {}

  join(user: PresenceInfo) {
    this.presence.set(user.id, user);
    this.events.emit('collaborator-joined', user);
  }

  leave(id: string) {
    const user = this.presence.get(id);
    if (!user) return;
    this.presence.delete(id);
    this.events.emit('collaborator-left', user);
  }

  updatePresence(id: string, patch: Partial<PresenceInfo>) {
    const current = this.presence.get(id);
    if (!current) return;
    Object.assign(current, patch);
    this.events.emit('collaborator-updated', current);
  }

  recordChange(author: string, payload: unknown) {
    const message: ChangeMessage = { author, timestamp: performance.now(), payload };
    this.history.push(message);
    this.events.emit('change-recorded', message);
  }

  recentChanges(limit = 50) {
    return this.history.slice(-limit);
  }
}
