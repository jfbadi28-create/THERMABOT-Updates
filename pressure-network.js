/* THERMABOT · Motor multizona de presiones y caudales
   Modelo nodal no lineal para redes HVAC hospitalarias.
   Convención: presión manométrica [Pa], caudales mecánicos [m³/h].
   Las conexiones se resuelven por conservación de masa.
*/
(function(global){
  'use strict';

  const G = 9.80665;
  const RD = 287.055;
  const RV = 461.495;

  const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
  const finite = (v,d=0)=>Number.isFinite(Number(v))?Number(v):d;
  const sign = x => x > 0 ? 1 : x < 0 ? -1 : 0;

  function satPressurePa(tC){
    return 610.94 * Math.exp((17.625*tC)/(tC+243.04));
  }

  function moistAirDensity(tC, rhPct=50, pAtmPa=101325){
    const tK = finite(tC,22) + 273.15;
    const pv = clamp(finite(rhPct,50),0,100)/100 * satPressurePa(finite(tC,22));
    const pd = Math.max(1000, finite(pAtmPa,101325) - pv);
    return pd/(RD*tK) + pv/(RV*tK);
  }

  function normalizeNode(node){
    return {
      id:String(node.id),
      name:String(node.name || node.nombre || node.id),
      supplyM3h:Math.max(0,finite(node.supplyM3h ?? node.impulsion_m3h,0)),
      returnM3h:Math.max(0,finite(node.returnM3h ?? node.retorno_m3h,0)),
      exhaustM3h:Math.max(0,finite(node.exhaustM3h ?? node.extraccion_m3h,0)),
      outdoorM3h:Math.max(0,finite(node.outdoorM3h ?? node.aire_exterior_m3h,0)),
      volumeM3:Math.max(0,finite(node.volumeM3 ?? node.volumen_m3,0)),
      temperatureC:finite(node.temperatureC ?? node.temperatura_c,22),
      rhPct:clamp(finite(node.rhPct ?? node.hr_pct,50),0,100),
      elevationM:finite(node.elevationM ?? node.cota_m,0),
      targetPa:finite(node.targetPa ?? node.presion_objetivo_pa,0),
      fixedPressurePa:node.fixedPressurePa == null ? null : finite(node.fixedPressurePa,0),
      pAtmPa:Math.max(50000,finite(node.pAtmPa,101325))
    };
  }

  function normalizeConnection(c){
    const model = ['powerLaw','orifice'].includes(c.model) ? c.model : 'powerLaw';
    return {
      id:String(c.id),
      from:String(c.from),
      to:String(c.to),
      name:String(c.name || c.nombre || c.id),
      model,
      C:Math.max(0,finite(c.C ?? c.coefficient,25)),
      n:clamp(finite(c.n ?? c.exponent,0.65),0.5,1.0),
      areaM2:Math.max(0,finite(c.areaM2 ?? c.area_m2,0.01)),
      Cd:clamp(finite(c.Cd ?? c.cd,0.65),0.05,1.2),
      heightM:finite(c.heightM ?? c.altura_m,0),
      windPa:finite(c.windPa ?? c.viento_pa,0),
      preferredDirection:c.preferredDirection || c.direccion_objetivo || 'either',
      quality:c.quality || c.calidad || 'estimated'
    };
  }

  function effectiveDeltaP(conn, fromNode, toNode, pFrom, pTo){
    const rhoFrom = moistAirDensity(fromNode.temperatureC,fromNode.rhPct,fromNode.pAtmPa);
    const rhoTo = moistAirDensity(toNode.temperatureC,toNode.rhPct,toNode.pAtmPa);
    const stackPa = G * finite(conn.heightM,0) * (rhoTo-rhoFrom);
    return (pFrom-pTo) + stackPa + finite(conn.windPa,0);
  }

  function connectionFlow(conn, fromNode, toNode, pFrom, pTo){
    const dp = effectiveDeltaP(conn,fromNode,toNode,pFrom,pTo);
    if(Math.abs(dp) < 1e-12){
      return {dpPa:dp, qM3h:0, massKgS:0, rhoUpstream:(moistAirDensity(fromNode.temperatureC,fromNode.rhPct,fromNode.pAtmPa)+moistAirDensity(toNode.temperatureC,toNode.rhPct,toNode.pAtmPa))/2};
    }
    const s = sign(dp);
    const upstream = s>0 ? fromNode : toNode;
    const rho = moistAirDensity(upstream.temperatureC,upstream.rhPct,upstream.pAtmPa);
    let qM3h;
    if(conn.model === 'orifice'){
      const qM3s = finite(conn.Cd,0.65) * Math.max(0,finite(conn.areaM2,0)) * Math.sqrt(2*Math.abs(dp)/Math.max(rho,0.2));
      qM3h = s * qM3s * 3600;
    }else{
      qM3h = s * Math.max(0,finite(conn.C,0)) * Math.pow(Math.abs(dp),finite(conn.n,0.65));
    }
    const massKgS = qM3h/3600 * rho;
    return {dpPa:dp,qM3h,massKgS,rhoUpstream:rho};
  }

  function gaussianSolve(A,b){
    const n=A.length;
    const M=A.map((r,i)=>r.slice().concat([b[i]]));
    for(let k=0;k<n;k++){
      let piv=k;
      for(let i=k+1;i<n;i++) if(Math.abs(M[i][k])>Math.abs(M[piv][k])) piv=i;
      if(Math.abs(M[piv][k])<1e-14) throw new Error('Jacobiano singular: revise conexiones o zonas desconectadas.');
      if(piv!==k){const tmp=M[k];M[k]=M[piv];M[piv]=tmp;}
      const d=M[k][k];
      for(let j=k;j<=n;j++) M[k][j]/=d;
      for(let i=0;i<n;i++){
        if(i===k) continue;
        const f=M[i][k];
        if(Math.abs(f)<1e-18) continue;
        for(let j=k;j<=n;j++) M[i][j]-=f*M[k][j];
      }
    }
    return M.map(r=>r[n]);
  }

  function buildModel(input){
    const nodes=(input.nodes||[]).map(normalizeNode);
    if(nodes.length<2) throw new Error('La red requiere al menos dos ambientes/nodos.');
    const byId=new Map(nodes.map(n=>[n.id,n]));
    const conns=(input.connections||[]).map(normalizeConnection);
    for(const c of conns){
      if(!byId.has(c.from)||!byId.has(c.to)) throw new Error(`Conexión ${c.name}: nodo inexistente.`);
      if(c.from===c.to) throw new Error(`Conexión ${c.name}: origen y destino son iguales.`);
    }
    let refId=input.referenceNodeId && byId.has(String(input.referenceNodeId)) ? String(input.referenceNodeId) : null;
    if(!refId){
      const fixed=nodes.find(n=>n.fixedPressurePa!=null);
      refId=fixed ? fixed.id : nodes[0].id;
    }
    const ref=byId.get(refId);
    const referencePa=ref.fixedPressurePa==null ? finite(input.referencePressurePa,0) : ref.fixedPressurePa;
    const unknown=nodes.filter(n=>n.id!==refId);
    return {nodes,byId,conns,refId,referencePa,unknown};
  }

  function massResidual(model, pressureMap){
    const res=new Map(model.nodes.map(n=>[n.id,0]));
    for(const node of model.nodes){
      const rho=moistAirDensity(node.temperatureC,node.rhPct,node.pAtmPa);
      const mech=(node.supplyM3h-node.returnM3h-node.exhaustM3h)/3600*rho;
      res.set(node.id,res.get(node.id)+mech);
    }
    const flowDetails=[];
    for(const conn of model.conns){
      const a=model.byId.get(conn.from),b=model.byId.get(conn.to);
      const pf=pressureMap.get(a.id),pt=pressureMap.get(b.id);
      const f=connectionFlow(conn,a,b,pf,pt);
      res.set(a.id,res.get(a.id)-f.massKgS);
      res.set(b.id,res.get(b.id)+f.massKgS);
      flowDetails.push({...f,connection:conn});
    }
    return {res,flowDetails};
  }

  function connectedToReference(model){
    const adj=new Map(model.nodes.map(n=>[n.id,[]]));
    model.conns.forEach(c=>{adj.get(c.from).push(c.to);adj.get(c.to).push(c.from);});
    const seen=new Set([model.refId]),q=[model.refId];
    while(q.length){
      const x=q.shift();
      for(const y of adj.get(x)){if(!seen.has(y)){seen.add(y);q.push(y);}}
    }
    return seen;
  }

  function solveNetwork(input, options={}){
    const model=buildModel(input);
    const seen=connectedToReference(model);
    const disconnected=model.nodes.filter(n=>!seen.has(n.id));
    if(disconnected.length) throw new Error(`Zonas desconectadas de la referencia: ${disconnected.map(n=>n.name).join(', ')}.`);

    const tolMass=finite(options.toleranceKgS,1e-7);
    const maxIter=Math.max(10,Math.floor(finite(options.maxIterations,80)));
    const pMax=Math.max(50,finite(options.maxAbsPressurePa,500));
    const ids=model.unknown.map(n=>n.id);
    let x=model.unknown.map(n=>clamp(finite(n.targetPa,0)-model.referencePa,-pMax,pMax));

    const makePressureMap=vec=>{
      const m=new Map([[model.refId,model.referencePa]]);
      ids.forEach((id,i)=>m.set(id,clamp(vec[i],-pMax,pMax)));
      return m;
    };
    const residualVector=vec=>{
      const pm=makePressureMap(vec);
      const rr=massResidual(model,pm).res;
      return ids.map(id=>rr.get(id));
    };
    const normInf=v=>v.reduce((m,z)=>Math.max(m,Math.abs(z)),0);

    let converged=false,iter=0;
    for(iter=0;iter<maxIter;iter++){
      const f=residualVector(x);
      const norm=normInf(f);
      if(norm<=tolMass){converged=true;break;}
      const n=x.length;
      const J=Array.from({length:n},()=>Array(n).fill(0));
      for(let j=0;j<n;j++){
        const h=Math.max(1e-4,1e-4*Math.max(1,Math.abs(x[j])));
        const xp=x.slice(),xm=x.slice();xp[j]+=h;xm[j]-=h;
        const fp=residualVector(xp),fm=residualVector(xm);
        for(let i=0;i<n;i++) J[i][j]=(fp[i]-fm[i])/(2*h);
      }
      let dx;
      try{dx=gaussianSolve(J,f.map(z=>-z));}
      catch(err){throw new Error(`${err.message} Iteración ${iter+1}.`);}
      let lambda=1,best=x.slice(),bestNorm=norm;
      for(let ls=0;ls<14;ls++){
        const trial=x.map((v,i)=>clamp(v+lambda*dx[i],-pMax,pMax));
        const tn=normInf(residualVector(trial));
        if(tn<bestNorm){best=trial;bestNorm=tn;break;}
        lambda*=0.5;
      }
      if(bestNorm>=norm) best=x.map((v,i)=>clamp(v+0.01*dx[i],-pMax,pMax));
      x=best;
    }

    const pressures=makePressureMap(x);
    const final=massResidual(model,pressures);
    const maxResidual=Math.max(...model.unknown.map(n=>Math.abs(final.res.get(n.id))),0);
    const referenceResidualKgS=final.res.get(model.refId);
    if(maxResidual<=tolMass*5) converged=true;

    const nodeResults=model.nodes.map(node=>{
      const rho=moistAirDensity(node.temperatureC,node.rhPct,node.pAtmPa);
      const pressurePa=pressures.get(node.id);
      return {
        id:node.id,name:node.name,pressurePa,targetPa:node.targetPa,
        errorPa:pressurePa-node.targetPa,
        densityKgM3:rho,
        supplyM3h:node.supplyM3h,returnM3h:node.returnM3h,exhaustM3h:node.exhaustM3h,outdoorM3h:node.outdoorM3h,
        supplyACH:node.volumeM3>0?node.supplyM3h/node.volumeM3:null,
        outdoorACH:node.volumeM3>0?node.outdoorM3h/node.volumeM3:null,
        residualKgS:final.res.get(node.id)
      };
    });

    const connResults=final.flowDetails.map(fd=>{
      const c=fd.connection;
      const actual = fd.qM3h>1e-6 ? 'from_to' : fd.qM3h<-1e-6 ? 'to_from' : 'neutral';
      const directionOk = c.preferredDirection==='either' || actual==='neutral' || actual===c.preferredDirection;
      return {
        id:c.id,name:c.name,from:c.from,to:c.to,model:c.model,
        dpPa:fd.dpPa,qM3h:fd.qM3h,massKgS:fd.massKgS,
        preferredDirection:c.preferredDirection,actualDirection:actual,directionOk,quality:c.quality
      };
    });

    const q=connResults.map(c=>c.quality);
    const quality = q.length && q.every(x=>x==='measured') ? 'alta' :
      q.length && q.every(x=>x==='measured'||x==='manufacturer') ? 'media-alta' :
      q.some(x=>x==='estimated') ? 'preliminar' : 'media';

    const warnings=[];
    if(!converged) warnings.push(`El solver no alcanzó la tolerancia objetivo. Residuo máximo ${maxResidual.toExponential(2)} kg/s.`);
    connResults.filter(c=>!c.directionOk).forEach(c=>warnings.push(`Flujo inverso en ${c.name}: ${Math.abs(c.qM3h).toFixed(0)} m³/h.`));
    nodeResults.forEach(n=>{
      if(Math.abs(n.errorPa)>Math.max(1,Math.abs(n.targetPa)*0.15)) warnings.push(`${n.name}: presión calculada ${n.pressurePa.toFixed(1)} Pa vs objetivo ${n.targetPa.toFixed(1)} Pa.`);
    });

    return {converged,iterations:iter,maxResidualKgS:maxResidual,referenceResidualKgS,referenceNodeId:model.refId,referencePressurePa:model.referencePa,quality,nodeResults,connectionResults:connResults,warnings};
  }

  function designReturnsForTargets(input){
    const model=buildModel(input);
    const pressures=new Map();
    for(const node of model.nodes) pressures.set(node.id,node.id===model.refId?model.referencePa:node.targetPa);

    const netOutMass=new Map(model.nodes.map(n=>[n.id,0]));
    const connResults=[];
    for(const c of model.conns){
      const a=model.byId.get(c.from),b=model.byId.get(c.to);
      const f=connectionFlow(c,a,b,pressures.get(a.id),pressures.get(b.id));
      netOutMass.set(a.id,netOutMass.get(a.id)+f.massKgS);
      netOutMass.set(b.id,netOutMass.get(b.id)-f.massKgS);
      connResults.push({id:c.id,name:c.name,from:c.from,to:c.to,dpPa:f.dpPa,qM3h:f.qM3h});
    }

    const nodes=model.nodes.map(node=>{
      const rho=moistAirDensity(node.temperatureC,node.rhPct,node.pAtmPa);
      const mSupply=node.supplyM3h/3600*rho;
      const mExhaust=node.exhaustM3h/3600*rho;
      const requiredReturnMass=mSupply-mExhaust-netOutMass.get(node.id);
      const requiredReturnM3h=requiredReturnMass/rho*3600;
      const feasible=requiredReturnM3h>=-1e-6;
      return {
        id:node.id,name:node.name,targetPa:pressures.get(node.id),
        supplyM3h:node.supplyM3h,exhaustM3h:node.exhaustM3h,
        requiredReturnM3h:Math.max(0,requiredReturnM3h),
        rawRequiredReturnM3h:requiredReturnM3h,
        feasible,
        netTransferOutM3h:netOutMass.get(node.id)/rho*3600
      };
    });
    const warnings=nodes.filter(n=>!n.feasible).map(n=>`${n.name}: con la impulsión/extracción actual no puede alcanzarse la cascada objetivo ajustando sólo el retorno.`);
    return {referenceNodeId:model.refId,nodeResults:nodes,connectionResults:connResults,warnings};
  }

  const api={solveNetwork,designReturnsForTargets,connectionFlow,moistAirDensity,satPressurePa,version:'1.0.0'};
  if(typeof module!=='undefined' && module.exports) module.exports=api;
  global.THERMABOT_PRESSURE_ENGINE=api;
})(typeof window!=='undefined'?window:globalThis);
