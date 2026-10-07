// Presentation geometry only. This module never changes thermal inputs.
export type Point3 = [number,number,number];
export interface Camera3D {yaw:number;pitch:number;zoom:number;view:'perspective'|'plan';roof:boolean;}
export interface ViewerFace {id:string;name:string;kind:'wall'|'roof'|'window';points:Point3[];hostId?:string;}
export interface ViewerModel {width:number;depth:number;height:number;frontBearing:number;wallIds:string[];roofIds:string[];windows:{id:string;name:string;parentId?:string;area:number}[];}
export interface ProjectedPoint {x:number;y:number;z:number;}
export interface Projection3D {project:(p:Point3)=>ProjectedPoint;scale:number;}
export function newCamera():Camera3D {return {yaw:-.65,pitch:.52,zoom:1,view:'perspective',roof:false};}
export function geographicBearing(engineAzimuth:number):number {return ((engineAzimuth+180)%360+360)%360;}
export function northVector(frontBearing:number):Point3 {const a=frontBearing*Math.PI/180;return [-Math.sin(a),0,-Math.cos(a)];}
export function cameraCoordinates(p:Point3,camera:Camera3D):Point3 {
 const cy=Math.cos(camera.yaw),sy=Math.sin(camera.yaw),pitch=camera.view==='plan'?Math.PI/2:camera.pitch,cp=Math.cos(pitch),sp=Math.sin(pitch);
 const x=p[0]*cy-p[2]*sy,z=p[0]*sy+p[2]*cy;
 return [x,-p[1]*cp+z*sp,p[1]*sp+z*cp];
}
export function fitProjection(model:ViewerModel,camera:Camera3D,width:number,height:number):Projection3D {
 const x=model.width/2,z=model.depth/2,corners:Point3[]=[];
 for(const xx of [-x,x])for(const zz of [-z,z])for(const yy of [0,model.height])corners.push([xx,yy,zz]);
 const points=corners.map(p=>cameraCoordinates(p,camera)),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]);
 const minX=Math.min(...xs),maxX=Math.max(...xs),minY=Math.min(...ys),maxY=Math.max(...ys);
 const scale=Math.min(Math.max(80,width-110)/Math.max(.1,maxX-minX),Math.max(100,height-130)/Math.max(.1,maxY-minY))*camera.zoom;
 const ox=width/2-(minX+maxX)*scale/2,oy=height/2+5-(minY+maxY)*scale/2;
 return {scale,project:(p:Point3)=>{const q=cameraCoordinates(p,camera);return {x:ox+q[0]*scale,y:oy+q[1]*scale,z:q[2]};}};
}
export function roomFaces(model:ViewerModel):ViewerFace[] {
 const x=model.width/2,z=model.depth/2,h=model.height;
 const corners:Point3[][]=[
  [[-x,0,-z],[x,0,-z],[x,h,-z],[-x,h,-z]],
  [[x,0,-z],[x,0,z],[x,h,z],[x,h,-z]],
  [[x,0,z],[-x,0,z],[-x,h,z],[x,h,z]],
  [[-x,0,z],[-x,0,-z],[-x,h,-z],[-x,h,z]]
 ];
 const faces:ViewerFace[]=model.wallIds.slice(0,4).map((id,n)=>({id,name:['Frente','Derecha','Fondo','Izquierda'][n],kind:'wall',points:corners[n]}));
 model.roofIds.forEach(id=>faces.push({id,name:'Cubierta',kind:'roof',points:[[-x,h,-z],[x,h,-z],[x,h,z],[-x,h,z]]}));
 // The existing contract stores opening area, not its surveyed width/location.
 // Equal-height openings with exact represented area are deliberately schematic.
 for(const face of [...faces]){
  const openings=model.windows.filter(w=>w.parentId===face.id),count=openings.length;if(!count)continue;
  const side=model.wallIds.indexOf(face.id),span=face.kind==='roof'?model.width:side%2===0?model.width:model.depth;
  const vertical=face.kind==='roof'?model.depth:model.height;
  const fraction=Math.min(1,openings.reduce((a,w)=>a+w.area,0)/(span*vertical));
  const wh=vertical*Math.sqrt(fraction),gap=(span-span*Math.sqrt(fraction))/(count+1);let offset=-span/2+gap;
  openings.forEach((win,n)=>{
   if(!(win.area>0))return;
   const ww=Math.min(span,win.area/Math.max(wh,.001)),u=offset+ww/2,v=face.kind==='roof'?0:vertical/2;offset+=ww+gap;
   const a=u-ww/2,b=u+ww/2,lo=v-wh/2,hi=v+wh/2;
   let pts:Point3[];
   if(face.kind==='roof')pts=[[a,h,-wh/2],[b,h,-wh/2],[b,h,wh/2],[a,h,wh/2]];
   else if(side===0)pts=[[a,lo,-z],[b,lo,-z],[b,hi,-z],[a,hi,-z]];
   else if(side===1)pts=[[x,lo,a],[x,lo,b],[x,hi,b],[x,hi,a]];
   else if(side===2)pts=[[-b,lo,z],[-a,lo,z],[-a,hi,z],[-b,hi,z]];
   else pts=[[-x,lo,-b],[-x,lo,-a],[-x,hi,-a],[-x,hi,-b]];
   faces.push({id:win.id,name:win.name,kind:'window',hostId:face.id,points:pts});
  });
 }
 return faces;
}
export function orderFaces(faces:ViewerFace[],projection:Projection3D):ViewerFace[] {
 const depth=(f:ViewerFace)=>f.points.reduce((a,p)=>a+projection.project(p).z,0)/f.points.length;
 // Paint each opening with its host so a foreground wall can occlude it.
 const hosts=faces.filter(f=>f.kind!=='window').sort((a,b)=>depth(a)-depth(b));
 return hosts.flatMap(f=>[f,...faces.filter(w=>w.kind==='window'&&w.hostId===f.id)]);
}
