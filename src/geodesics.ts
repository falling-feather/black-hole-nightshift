/** Schwarzschild null geodesics in the orbital plane, in r_s units.
 * u'' = 3u²/2 - u; dt/dφ = 1 / (b u² (1-u)).
 * The generated table is shared by all pixels and contains no imported data.
 */
export const CRITICAL_IMPACT=3*Math.sqrt(3)/2;
export const OUTER_RADIUS=256;
export const MAX_IMPACT=90;
export const MAX_PHI=6*Math.PI;
// Resolve the short incoming segment instead of spending almost all samples far past it.
export const ANGLE_EXPONENT=2;

export interface RayRow { impact:number; turn:number; end:number; captured:boolean }
export interface RayTable { width:number; height:number; data:Float32Array; rows:RayRow[] }

export function impactAt(value:number) {
  return value<=0.3
    ? Math.max(0.001,CRITICAL_IMPACT*(1-(1-value/0.3)**2))
    : CRITICAL_IMPACT+(MAX_IMPACT-CRITICAL_IMPACT)*((value-0.3)/0.7)**3;
}
export function impactCoordinate(impact:number) {
  return impact<=CRITICAL_IMPACT
    ? 0.3*(1-Math.sqrt(Math.max(0,1-impact/CRITICAL_IMPACT)))
    : 0.3+0.7*Math.cbrt((impact-CRITICAL_IMPACT)/(MAX_IMPACT-CRITICAL_IMPACT));
}
const force=(u:number)=>1.5*u*u-u;
// Remove the steep, analytically known radial travel before storing/interpolating time.
// Interpolating full coordinate time directly is ill-conditioned near radial rays.
function radialTravel(u:number) {
  const radius=1/u;
  return OUTER_RADIUS-radius+Math.log((OUTER_RADIUS-1)/(radius-1));
}
function closestInverseRadius(impact:number) {
  let low=1/OUTER_RADIUS,high=2/3;
  for(let i=0;i<42;i++) {
    const mid=(low+high)/2;
    if(mid*mid*(1-mid)<1/(impact*impact)) low=mid;else high=mid;
  }
  return (low+high)/2;
}

export function buildRayTable(height=768,width=2048):RayTable {
  const data=new Float32Array(width*height*4),rows:RayRow[]=[];
  for(let row=0;row<height;row++) {
    const impact=impactAt(row/(height-1));
    let u=1/OUTER_RADIUS,du=Math.sqrt(1/(impact*impact)-u*u+u*u*u);
    let residual=0,correction=0;
    let turn=MAX_PHI,end=MAX_PHI,done=false;
    const captured=impact<CRITICAL_IMPACT;
    const turnTravel=captured?0:radialTravel(closestInverseRadius(impact));
    const timeResidual=(v:number)=>1/(1/impact+Math.abs(v));
    for(let col=0;col<width;col++) {
      const index=(row*width+col)*4;
      data[index]=u;data[index+1]=du;data[index+2]=correction;
      if(done || col===width-1) continue;
      const phi=MAX_PHI*(col/(width-1))**ANGLE_EXPONENT;
      const h=MAX_PHI*((col+1)/(width-1))**ANGLE_EXPONENT-phi;
      if(du>0 && u+du*h>=1) {
        end=phi+(1-u)/du;turn=end;u=1.01;du=0;done=true;continue;
      }
      const k1u=du,k1v=force(u);
      const k2u=du+k1v*h/2,k2v=force(u+k1u*h/2);
      const k3u=du+k2v*h/2,k3v=force(u+k2u*h/2);
      const k4u=du+k3v*h,k4v=force(u+k3u*h);
      const nextU=u+h*(k1u+2*k2u+2*k3u+k4u)/6;
      const nextDu=du+h*(k1v+2*k2v+2*k3v+k4v)/6;
      residual+=h*(timeResidual(du)+2*timeResidual(k2u)+2*timeResidual(k3u)+timeResidual(k4u))/6;
      if(du>0 && nextDu<=0) turn=phi+h*du/(du-nextDu);
      if(nextDu<0 && nextU<=1/OUTER_RADIUS) {
        end=phi+h*(u-1/OUTER_RADIUS)/(u-nextU);u=-1;du=0;done=true;
      } else {
        u=nextU;du=nextDu;
        correction=residual+(du<0?2*(turnTravel-radialTravel(u)):0);
      }
    }
    rows.push({impact,turn,end,captured});
  }
  return {width,height,data,rows};
}

export function sampleRay(table:RayTable,impact:number,phi:number) {
  const angle=Math.max(0,Math.min(MAX_PHI,phi));
  const x=(angle/MAX_PHI)**(1/ANGLE_EXPONENT)*(table.width-1);
  const y=Math.max(0,Math.min(table.height-1,impactCoordinate(impact)*(table.height-1)));
  const x0=Math.floor(x),x1=Math.min(x0+1,table.width-1),y0=Math.floor(y),y1=Math.min(y0+1,table.height-1);
  const read=(channel:number)=>{
    const a=table.data[(y0*table.width+x0)*4+channel]*(1-x%1)+table.data[(y0*table.width+x1)*4+channel]*(x%1);
    const b=table.data[(y1*table.width+x0)*4+channel]*(1-x%1)+table.data[(y1*table.width+x1)*4+channel]*(x%1);
    return a*(1-y%1)+b*(y%1);
  };
  const u=read(0);
  // Coordinate time is undefined beyond the stored physical trajectory.
  return {u,du:read(1),time:u>0 && u<1?radialTravel(u)+read(2):Number.NaN};
}

export function observerPhase(table:RayTable,impact:number,radius:number) {
  const row=Math.round(impactCoordinate(impact)*(table.height-1));
  let low=0,high=table.rows[Math.max(0,Math.min(row,table.height-1))].turn;
  for(let i=0;i<16;i++) {
    const mid=(low+high)/2;
    if(sampleRay(table,impact,mid).u<1/radius) low=mid;else high=mid;
  }
  const phi=(low+high)/2;
  return {phi,time:sampleRay(table,impact,phi).time};
}

export function observerMetadata(table:RayTable,radius:number):Float32Array {
  const result=new Float32Array(table.height*4);
  for(let row=0;row<table.height;row++) {
    const ray=table.rows[row];
    const observer=observerPhase(table,ray.impact,radius);
    result[row*4]=ray.end-observer.phi+Math.asin(ray.impact/OUTER_RADIUS);
    result[row*4+1]=observer.phi;result[row*4+2]=observer.time;result[row*4+3]=ray.end;
  }
  return result;
}
