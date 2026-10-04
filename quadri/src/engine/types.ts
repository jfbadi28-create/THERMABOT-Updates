import type {QuadriSettings,QuadriHour} from './quadri.ts';
export type Provenance = 'ingresado'|'heredado'|'calculado'|'medido'|'biblioteca'|'supuesto';
export type Unit = 'kcal/h'|'kcal/(h·m²·°C)'|'m³/min'|'g/kg'|'W'|'kW'|'m³/s'|'m³/h'|'kg_da/s'|'kJ/kg_da'|'J/kg_da'|'Pa'|'kPa'|'°C'|'K'|'m'|'m²'|'m³'|'W/(m²·K)'|'m³/kg_da'|'kg_w/kg_da'|'kg_w/s'|'kg/m³'|'%'|'1'|'h'|'°'|'W/m²'|'W/(m·K)'|'m²·K/W'|'ACH'|'min';
export interface Datum {value:number;unit:Unit;provenance:Provenance;source:string;}
export interface Variable {value:number|number[]|string;unit:string;provenance:Provenance;source:string;}
export interface Trace {id:string;label:string;equation:string;variables:Record<string,Variable>;result:number|number[]|null;unit:string;source:string;engineVersion:string;warnings:string[];}
export interface Warning {code:string;message:string;path:string;}
export interface Result<T> {value:T;trace:Trace[];warnings:Warning[];}
export interface FactorSet {values:number[];source:string;construction:string;version:string;provenance:Provenance;libraryId?:string;}
export interface FactorInput {cts?:FactorSet;rts?:FactorSet;solarRts?:FactorSet;}
export interface AirState {temperature:Datum;rh:Datum;pressure:Datum;w:number;h:number;v:number;pws:number;pw:number;rhoDry:number;rhoMoist:number;dewPoint:number|null;wetBulb:number|null;trace:Trace[];warnings:Warning[];}
export interface Location {latitude:Datum;longitude:Datum;timezone:Datum;altitude:Datum;day:number;year:number;}
export interface Radiation {mode:'manual'|'tau';dni:Datum[];dhi:Datum[];tauBeam?:Datum;tauDiffuse?:Datum;transposition:'isotropic'|'hay-davies';albedo:Datum;}
export interface Climate {location:Location;temperature:Datum[];rh:Datum[];indoorTemperature:Datum;indoorRH:Datum;supplyTemperature:Datum;supplyRH:Datum;pressure?:Datum;radiation:Radiation;}
export interface Surface {quadriBoundary?:'exterior'|'no-climatizado'|'climatizado';quadriMaterial?:string;quadriDelta?:Datum;id:string;name:string;area:Datum;grossArea?:Datum;areaMode?:'manual'|'long-wall'|'short-wall'|'floor';kind?:'wall'|'roof';u:Datum;tilt:Datum;azimuth:Datum;absorptance:Datum;exteriorH:Datum;emissivity:Datum;longwave:Datum;radiantFraction:Datum;factors?:FactorInput;}
export interface WindowSurface {quadriMaterial?:string;quadriC?:Datum;quadriShading?:string;id:string;name:string;parentId?:string;area:Datum;u:Datum;tilt:Datum;azimuth:Datum;shgcBeam:Datum;shgcDiffuse:Datum;iacBeam:Datum;iacDiffuse:Datum;sunlitFraction:Datum[];radiantFraction:Datum;factors?:FactorInput;}
export interface InternalLoads {
 people:{count:Datum;sensible:Datum;latent:Datum;radiantFraction:Datum;schedule:Datum[]};
 lights:{installedPower:Datum;utilization:Datum;allowance:Datum;spaceFraction:Datum;radiantFraction:Datum;schedule:Datum[]};
 equipment:{inputPower:Datum;use:Datum;load:Datum;spaceFraction:Datum;sensibleFraction:Datum;latentFraction:Datum;radiantFraction:Datum;schedule:Datum[]};
}
export interface ProjectInput {quadri?:QuadriSettings;schemaVersion:2;id:string;name:string;projectId:string;room:string;requestedMode:'RTS'|'instantaneo';fallback:'instantaneo'|'error';history:'periodico';climate:Climate;geometry:{length:Datum;width:Datum;height:Datum};surfaces:Surface[];windows:WindowSurface[];internals:InternalLoads;infiltrationACH:Datum;outdoorFlow:Datum;ventilationDestination:'sistema'|'ambiente';factors:FactorInput;systemSensible:Datum;systemLatent:Datum;}
export interface HourResult {hour:number;sensible:number;latent:number;total:number;systemSensible:number;systemLatent:number;systemTotal:number;coilDemand:number;components:Record<string,{sensible:number;latent:number}>;trace:Trace[];}
export interface Calculation {quadri?:{season:string;hours:QuadriHour[];peak:QuadriHour};input:ProjectInput;engineVersion:string;mode:'RTS'|'instantaneo'|'mixto'|'Quadri';hours:HourResult[];peak:HourResult;systemPeak:HourResult;states:{outdoor:AirState[];room:AirState;supply:AirState};supplyFlow:number|null;moistureRemoval:number|null;latentCheck:boolean|null;warnings:Warning[];trace:Trace[];}
export interface SharedPartition {id:string;projectId:string;name:string;roomAId:string;surfaceAId:string;roomBId:string;surfaceBId:string;area:Datum;u:Datum;model:'estacionario';}
export interface RoomPartition {id:string;name:string;surfaceId:string;adjacentRoomId:string;adjacentRoomName:string;area:Datum;u:Datum;adjacentTemperature:Datum;model:'estacionario';}
export interface BuildingInput {schemaVersion:1;projectId:string;name:string;rooms:ProjectInput[];partitions?:SharedPartition[];}
export interface BuildingCalculation {input:BuildingInput;results:Calculation[];hours:{hour:number;sensible:number;latent:number;total:number}[];peak:{hour:number;sensible:number;latent:number;total:number};area:number;volume:number;trace:Trace[];warnings:Warning[];}
