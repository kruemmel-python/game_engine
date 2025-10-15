export async function mountDebugUI(getCameraRig: ()=>any){
  const { Pane } = await import('tweakpane');
  const pane = new Pane({ title: 'Debug' });
  const cam = { distance: 3.5, height: 1.4 };
  pane.addBinding(cam, 'distance', {min:1,max:10}).on('change', ()=>{ const rig=getCameraRig(); const comp = rig?.components?.find((c:any)=> c.constructor?.name==='CameraFollow'); if(comp) comp.distance = cam.distance; });
  pane.addBinding(cam, 'height', {min:0,max:5}).on('change', ()=>{ const rig=getCameraRig(); const comp = rig?.components?.find((c:any)=> c.constructor?.name==='CameraFollow'); if(comp) comp.height = cam.height; });
}
