#!/usr/bin/env node
/** Validate cross-file references and provenance in the full-book draft. */
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const root=path.resolve(path.dirname(new URL(import.meta.url).pathname),'..');
const dataDir=path.join(root,'data/hyperbook');
const read=async(name)=>JSON.parse(await readFile(path.join(dataDir,name),'utf8'));
const [hyperbook, vocabulary, edgeArtifact, encounterArtifact, affordanceArtifact, analysis]=await Promise.all([
  read('hyperbook.json'),read('entities.json'),read('edges.json'),read('encounters.json'),read('experience-affordances.json'),read('analysis.json')
]);
const raw=(await readFile(process.argv[2] || path.join(root,'tmp/hyperbook-extraction/book-raw.txt'),'utf8')).split('\f');
const normalize=(text)=>text.replace(/([\p{L}])-[\n\r]+\s*([\p{L}])/gu,'$1$2').replace(/([\p{L}])-\s+([\p{L}])/gu,'$1$2').replace(/[\n\r]+/g,' ').replace(/\s+/g,' ').replace(/\s+([,.;:!?])/g,'$1').trim();
const errors=[]; const assert=(condition,message)=>{if(!condition) errors.push(message);};
const objects=hyperbook.objects; const entities=vocabulary.entities;
const objectById=new Map(objects.map(x=>[x.id,x])); const entityById=new Map(entities.map(x=>[x.id,x]));
const allIds=[...objectById.keys(),...entityById.keys()];
assert(allIds.length===new Set(allIds).size,'Duplicate ID across book objects and controlled entities.');
const provenanceOk=(p,label)=>{
  assert(Boolean(p?.sourceDocumentId && p?.sectionId && Array.isArray(p?.printedPages) && p.printedPages.length===2),`${label} is missing source provenance.`);
  if(Array.isArray(p?.printedPages)) assert(p.printedPages[0]>=6 && p.printedPages[1]<=212 && p.printedPages[0]<=p.printedPages[1],`${label} has an invalid printed page range.`);
};
for(const object of objects) provenanceOk(object.provenance,object.id);
for(const entity of entities) provenanceOk(entity.provenance,entity.id);
const passages=objects.filter(x=>x.kind==='passage');
for(let page=6;page<=203;page++) assert(passages.filter(x=>x.provenance.printedPages[0]<=page&&x.provenance.printedPages[1]>=page).length===1,`Printed p. ${page} is not covered by exactly one coherent passage.`);
for(const quote of objects.filter(x=>x.kind==='quotation')) {
  const page=quote.provenance.printedPages[0];
  assert(page===quote.provenance.printedPages[1],`${quote.id} should point to one exact source page.`);
  assert(normalize(raw[page-1]||'').includes(quote.text),`${quote.id} text cannot be found in normalized PDF page ${page}.`);
  assert(objectById.has(quote.sourcePassageId),`${quote.id} has an unknown parent passage.`);
}
for(const edge of edgeArtifact.edges) {
  assert(objectById.has(edge.from)||entityById.has(edge.from),`${edge.id} has unknown from ${edge.from}.`);
  assert(objectById.has(edge.to)||entityById.has(edge.to),`${edge.id} has unknown to ${edge.to}.`);
  assert(['book-explicit','book-inferred'].includes(edge.assertion),`${edge.id} must not use editorial assertion.`);
  assert(['high','medium','low'].includes(edge.confidence),`${edge.id} has invalid confidence.`);
  assert(['strong','moderate','light'].includes(edge.strength),`${edge.id} has invalid strength.`);
  provenanceOk(edge.evidence,edge.id);
}
const seenQuoteText=new Set();
for(const encounter of encounterArtifact.encounters) {
  assert(objectById.has(encounter.sourceObjectId)||entityById.has(encounter.sourceObjectId),`${encounter.id} has unknown source object.`);
  provenanceOk(encounter.provenance,encounter.id);
  if(encounter.kind==='quotation') {
    assert(objectById.get(encounter.sourceObjectId)?.text===encounter.displayText,`${encounter.id} does not preserve its source quotation text.`);
    const key=encounter.displayText.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    assert(!seenQuoteText.has(key),`${encounter.id} duplicates a quotation encounter.`); seenQuoteText.add(key);
  }
}
for(const affordance of affordanceArtifact.affordances) {
  assert(encounterArtifact.encounters.some(x=>x.id===affordance.encounterId),`${affordance.id} has unknown encounter.`);
  assert(affordance.assertion==='editorial',`${affordance.id} must remain editorial.`);
  assert(['spatial','temporal','cartographic','interactional','conceptual'].includes(affordance.dimension),`${affordance.id} has invalid dimension.`);
  assert(['high','medium','low'].includes(affordance.confidence),`${affordance.id} has invalid confidence.`);
  assert(['strong','moderate','light'].includes(affordance.strength),`${affordance.id} has invalid strength.`);
  if(affordance.dimension==='spatial') {
    const entity=entityById.get(`place:${affordance.tag}`);
    assert(entity && entity.placeScale!=='country',`${affordance.id} violates the no-country-fallback rule.`);
    assert(affordance.activation.stateCues.includes('direct-place-match-only'),`${affordance.id} lacks direct-place-only protection.`);
  }
}
assert(analysis.counts.passages===passages.length,'analysis.json has stale passage count.');
assert(analysis.counts.encounterFragments===encounterArtifact.encounters.length,'analysis.json has stale encounter count.');
assert(analysis.counts.editorialAffordances===affordanceArtifact.affordances.length,'analysis.json has stale affordance count.');
if(errors.length){console.error(`Hyperbook validation failed with ${errors.length} error(s):\n${errors.map(x=>`- ${x}`).join('\n')}`);process.exitCode=1;}else{console.log(`Hyperbook full-book validation passed: ${passages.length} passages, ${encounterArtifact.encounters.length} encounters, ${affordanceArtifact.affordances.length} editorial affordances.`);}
