export type EventHandler<T=any> = (payload: T) => void;
export class EventBus {
  private map = new Map<string, EventHandler[]>();
  on<T=any>(type: string, fn: EventHandler<T>) { const arr=this.map.get(type)||[]; arr.push(fn as any); this.map.set(type, arr); return () => this.off(type, fn); }
  off(type: string, fn: EventHandler) { const arr=this.map.get(type)||[]; const i=arr.indexOf(fn); if(i>=0){ arr.splice(i,1); } }
  emit<T=any>(type: string, payload: T) { const arr=this.map.get(type)||[]; for (const fn of arr) try{ (fn as EventHandler<T>)(payload); } catch(e){ console.error(e); } }
}
