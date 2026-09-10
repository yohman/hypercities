#!/usr/bin/env node
/** Build auditable, data-level encounter simulations; this is not UI code. */
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const read=async(file)=>JSON.parse(await readFile(path.join(root,file),'utf8'));
const [encounterArtifact,mapGraph]=await Promise.all([read('data/hyperbook/encounters.json'),read('data/hyperbook-graph.json')]);
const encounters=encounterArtifact.encounters;
const maps=new Map(mapGraph.nodes.filter(x=>x.kind==='historical-map').map(x=>[x.id,x]));
const encounter=(page,phrase)=>{
  const hit=encounters.find(x=>x.kind==='quotation'&&x.provenance.printedPages[0]===page&&x.displayText.includes(phrase));
  if(!hit) throw new Error(`No encounter on p. ${page} containing: ${phrase}`);
  return {encounterId:hit.id,sourceObjectId:hit.sourceObjectId,sourcePassageId:hit.sourcePassageId,printedPage:page};
};
const map=(id)=>{const item=maps.get(id);if(!item)throw new Error(`Missing map ${id}`);return {id:item.id,title:item.title,place:item.place.label,year:item.temporal.startYear};};
const simulations=[
  {id:'derive:berlin-timewell',title:'Berlin: core, descend, alignment, return',map:map('map:4'),steps:[
    {...encounter(34,'drill down'),cause:{kind:'direct-spatial-plus-editorial-interaction',bookEvidence:'Berlin is named; the encounter literally describes drilling into Berlin layers.',state:['core-depth-many','move-earlier']}},
    {...encounter(56,'things unrepresented'),cause:{kind:'cartographic-plus-temporal',bookEvidence:'The passage concerns zoom and the Pharus map.',state:['select-historical-raster','zoom-change']}},
    {...encounter(111,'Aligning one representation'),cause:{kind:'cartographic-resonance',bookEvidence:'The source discusses alignment and relation.',state:['raster-basemap-alignment']}},
    {...encounter(64,'time-layers of the Anhalter'),cause:{kind:'direct-spatial-plus-revisit',bookEvidence:'Anhalter is a Berlin passage; its temporal language is literal.',state:['return-to-place','select-temporal-layer']}}
  ]},
  {id:'derive:los-angeles-network',title:'Los Angeles: ghosts to civic media',map:map('map:148'),steps:[
    {...encounter(69,'maps the past makes these ghosts visible'),cause:{kind:'direct-spatial',bookEvidence:'Ghost Maps is situated in Los Angeles.',state:['direct-place-match-only','select-historical-raster']}},
    {...encounter(72,'precise polygons'),cause:{kind:'cartographic',bookEvidence:'The Ghost Map passage names legends, data, and polygons.',state:['compare-representations']}},
    {...encounter(77,'in-depth exploration of a community in Los Angeles'),cause:{kind:'project-plus-place',bookEvidence:'PDub is explicitly named as a Los Angeles community project.',state:['conceptual-continuity','novelty-filter']}},
    {...encounter(82,'1939 “redlining” map of Los Angeles'),cause:{kind:'cartographic-plus-direct-spatial',bookEvidence:'The source names the historical-map situation directly.',state:['select-historical-raster','direct-place-match-only']}}
  ]},
  {id:'derive:wellington-no-geographic-fallback',title:'Wellington: a non-geographic resonance',map:map('map:234'),steps:[
    {...encounter(17,'Thick maps are sometimes called'),cause:{kind:'conceptual-plus-temporal',bookEvidence:'The source names layered historical dynamics.',state:['core-depth-many','select-temporal-layer'],geographicClaim:'none'}},
    {...encounter(110,'infinite regress'),cause:{kind:'cartographic',bookEvidence:'The source is explicitly about georeferencing.',state:['raster-basemap-alignment'],geographicClaim:'none'}},
    {...encounter(97,'zooming all the way out'),cause:{kind:'cartographic-plus-interactional',bookEvidence:'The source explicitly addresses a zoomed-out view.',state:['zoom-change'],geographicClaim:'none'}}
  ]},
  {id:'derive:book-led-to-tohoku',title:'Georeferencing to Tohoku: a book-led crossing',map:null,steps:[
    {...encounter(110,'infinite regress'),cause:{kind:'cartographic',bookEvidence:'Georeferencing is literal source content.',state:['raster-basemap-alignment']}},
    {...encounter(124,'Google Maps makes choices'),cause:{kind:'conceptual-continuity',bookEvidence:'Accuracy and representation follow through a shared source concept.',state:['conceptual-continuity']}},
    {...encounter(43,'listen to, map, and amplify'),cause:{kind:'book-inferred-plus-editorial',bookEvidence:'A source-indexed representation/participation continuity; it is not a geographic equivalence.',state:['follow-concept','novelty-filter']}},
    {...encounter(203,'The event remains.'),cause:{kind:'event-witnessing',bookEvidence:'The source explicitly makes the Tohoku gallery’s event/witness relation.',state:['follow-concept','encounter-voice']}}
  ]}
];
const artifact={schemaVersion:'0.3.0-draft',id:'derives:hyperbook-full-book',status:'review-required',purpose:'Auditable conceptual simulations for a future Experience Graph. They are not selection-engine implementation.',simulations};
await writeFile(path.join(root,'data/hyperbook/derives.json'),`${JSON.stringify(artifact,null,2)}\n`);
console.log(`Wrote ${simulations.length} conceptual dérive simulations.`);
