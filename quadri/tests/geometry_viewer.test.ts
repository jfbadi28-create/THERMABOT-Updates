import test from 'node:test';
import assert from 'node:assert/strict';
import {newCamera,geographicBearing,northVector,cameraCoordinates,fitProjection,roomFaces,orderFaces} from '../src/ui/geometry_viewer.ts';
import type {ViewerModel} from '../src/ui/geometry_viewer.ts';

const model:ViewerModel={width:6,depth:8,height:3,frontBearing:0,wallIds:['north','east','south','west'],roofIds:['roof'],windows:[{id:'glass-a',name:'Ventana A',parentId:'north',area:10},{id:'glass-b',name:'Ventana B',parentId:'north',area:1},{id:'skylight',name:'Lucernario',parentId:'roof',area:4}]};
const close=(a:number,b:number)=>assert.ok(Math.abs(a-b)<1e-8,`${a} ≠ ${b}`);
test('camera rotation/zoom cannot mutate geography, dimensions or opening areas',()=>{
 const input=structuredClone(model),before=JSON.stringify(input),camera=newCamera();
 camera.yaw=2.2;camera.pitch=.9;camera.zoom=1.5;
 const p=fitProjection(input,camera,800,340);orderFaces(roomFaces(input),p);cameraCoordinates(northVector(input.frontBearing),camera);
 assert.equal(JSON.stringify(input),before);northVector(input.frontBearing).forEach((v,n)=>close(v,[0,0,-1][n]));
});
test('engine azimuth converts to a north-based geographic bearing',()=>{
 assert.equal(geographicBearing(180),0);assert.equal(geographicBearing(-180),0);
 assert.equal(geographicBearing(-90),90);assert.equal(geographicBearing(0),180);assert.equal(geographicBearing(90),270);
});
test('3D faces use actual dimensions, not a fixed isometric drawing',()=>{
 const faces=roomFaces(model),north=faces.find(f=>f.id==='north')!,east=faces.find(f=>f.id==='east')!;
 close(north.points[1][0]-north.points[0][0],6);close(north.points[2][1]-north.points[1][1],3);
 close(east.points[1][2]-east.points[0][2],8);
});
test('schematic openings preserve unequal areas and stay on their real host plane',()=>{
 const faces=roomFaces(model),area=(id:string)=>{const p=faces.find(f=>f.id===id)!.points;return Math.hypot(...p[1].map((v,n)=>v-p[0][n]))*Math.hypot(...p[2].map((v,n)=>v-p[1][n]));};
 close(area('glass-a'),10);close(area('glass-b'),1);close(area('skylight'),4);
 for(const f of faces.filter(f=>f.kind==='window'))for(const p of f.points){assert.ok(Math.abs(p[0])<=3+1e-8);assert.ok(Math.abs(p[2])<=4+1e-8);assert.ok(p[1]>=0&&p[1]<=3);}
});
test('plan view preserves the true length/width ratio and removes height parallax',()=>{
 const c={...newCamera(),view:'plan' as const,yaw:0},p=fitProjection(model,c,700,340);
 const a=p.project([-3,0,-4]),b=p.project([3,0,-4]),d=p.project([-3,0,4]),top=p.project([-3,3,-4]);
 close(Math.abs(b.x-a.x)/Math.abs(d.y-a.y),6/8);close(top.x,a.x);close(top.y,a.y);
});
test('default fit contains extreme proportions at narrow and wide widths',()=>{
 for(const size of [{width:50,depth:1,height:2},{width:1,depth:1,height:15}])for(const w of [280,800]){
  const m={...model,...size},p=fitProjection(m,newCamera(),w,340);
  for(const f of roomFaces({...m,windows:[]}))for(const point of f.points){const q=p.project(point);assert.ok(q.x>=0&&q.x<=w);assert.ok(q.y>=0&&q.y<=340);}
 }
});
test('opening draw order follows its host for correct foreground occlusion',()=>{
 const p=fitProjection(model,newCamera(),700,340),ordered=orderFaces(roomFaces(model),p);
 for(const f of ordered.filter(f=>f.kind==='window'))assert.ok(ordered.findIndex(h=>h.id===f.hostId)<ordered.indexOf(f));
});
