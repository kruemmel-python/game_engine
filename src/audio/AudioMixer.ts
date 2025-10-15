export class AudioMixer {
  master=1; music=1; sfx=1; ui=1;
  set(type: 'master'|'music'|'sfx'|'ui', v: number){ (this as any)[type]=v; }
}
