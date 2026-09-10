#!/usr/bin/env node

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';

const root = path.resolve(import.meta.dirname, '..');
const sampleDirectory = path.join(root, 'data/phase-1-sample');
const read = (name) => JSON.parse(fs.readFileSync(path.join(sampleDirectory, name), 'utf8'));
const hyperbook = read('hyperbook.json');
const vocabulary = read('entities.json');
const edgeArtifact = read('edges.json');
const errors = [];
const check = (condition, message) => {
  if (!condition) errors.push(message);
};
const inRange = ([start, end], [outerStart, outerEnd]) => start >= outerStart && end <= outerEnd;
const validRange = (range) => Array.isArray(range) && range.length === 2 && range.every(Number.isInteger) && range[0] > 0 && range[0] <= range[1];
const sha256 = (filePath) => crypto.createHash('sha256').update(fs.readFileSync(filePath)).digest('hex');

check(hyperbook.status === 'review-required', 'hyperbook.json must stay review-required.');
check(vocabulary.status === 'review-required', 'entities.json must stay review-required.');
check(edgeArtifact.status === 'review-required', 'edges.json must stay review-required.');
check(hyperbook.scope?.includedRoutes?.length === 5, 'The sample must contain exactly the five requested review routes.');

const sourceIds = new Set(hyperbook.sourceDocuments.map((source) => source.id));
for (const source of hyperbook.sourceDocuments) {
  check(validRange(source.printedPageRange), `Source ${source.id} has an invalid printed page range.`);
  if (source.localFile && source.sha256) {
    const localPath = path.resolve(sampleDirectory, source.localFile);
    check(fs.existsSync(localPath), `Source ${source.id} is missing from ${localPath}.`);
    if (fs.existsSync(localPath)) check(sha256(localPath) === source.sha256, `Source ${source.id} hash does not match its declared PDF.`);
  }
}
const objectIds = new Set();
const sections = new Map();
for (const object of hyperbook.objects) {
  check(!objectIds.has(object.id), `Duplicate book object id ${object.id}.`);
  objectIds.add(object.id);
  const locator = object.provenance;
  check(locator && sourceIds.has(locator.sourceDocumentId), `Book object ${object.id} has an undeclared source document.`);
  check(locator && validRange(locator.printedPages), `Book object ${object.id} has an invalid page range.`);
  check(locator?.sectionId?.startsWith('section:'), `Book object ${object.id} has no section id.`);
  if (object.kind === 'section' || object.kind === 'window' || object.kind === 'gallery' || object.kind === 'apparatus') sections.set(object.id, object);
  if (object.kind === 'quotation') check(typeof object.text === 'string' && object.text.length > 0, `Quotation ${object.id} has no text.`);
  if (object.kind === 'code-fragment') check(typeof object.transcription === 'string' && object.transcription.length > 0, `Code fragment ${object.id} has no transcription.`);
}

for (const object of hyperbook.objects) {
  const locator = object.provenance;
  const section = sections.get(locator.sectionId);
  check(section, `Book object ${object.id} points to undeclared section ${locator.sectionId}.`);
  if (section) check(inRange(locator.printedPages, section.provenance.printedPages), `Book object ${object.id} has pages outside ${locator.sectionId}.`);
}

const entityTypes = new Set(vocabulary.entityTypes);
const entityIds = new Set();
for (const entity of vocabulary.entities) {
  check(!entityIds.has(entity.id), `Duplicate entity id ${entity.id}.`);
  entityIds.add(entity.id);
  check(entityTypes.has(entity.type), `Entity ${entity.id} has unknown type ${entity.type}.`);
  check(Array.isArray(entity.aliases), `Entity ${entity.id} has no aliases array.`);
  const locator = entity.provenance;
  check(locator && sourceIds.has(locator.sourceDocumentId), `Entity ${entity.id} has an undeclared source document.`);
  check(locator && validRange(locator.printedPages), `Entity ${entity.id} has an invalid page range.`);
  const section = sections.get(locator?.sectionId);
  check(section, `Entity ${entity.id} points to undeclared section ${locator?.sectionId}.`);
  if (section) check(inRange(locator.printedPages, section.provenance.printedPages), `Entity ${entity.id} has pages outside ${locator.sectionId}.`);
}

const allIds = new Set([...objectIds, ...entityIds]);
for (const object of hyperbook.objects) {
  if (object.narrativeVoiceId) check(entityIds.has(object.narrativeVoiceId), `Book object ${object.id} has missing narrative voice ${object.narrativeVoiceId}.`);
  if (object.speakerOrVoiceId) check(entityIds.has(object.speakerOrVoiceId), `Book object ${object.id} has missing speaker/voice ${object.speakerOrVoiceId}.`);
}
for (const entity of vocabulary.entities) {
  for (const reference of [entity.representsPersonId, entity.broaderPlaceId, entity.timeId].filter(Boolean)) {
    check(entityIds.has(reference), `Entity ${entity.id} refers to missing entity ${reference}.`);
  }
  for (const reference of entity.placeIds || []) check(entityIds.has(reference), `Entity ${entity.id} refers to missing place ${reference}.`);
}
const edgeIds = new Set();
for (const edge of edgeArtifact.edges) {
  check(!edgeIds.has(edge.id), `Duplicate edge id ${edge.id}.`);
  edgeIds.add(edge.id);
  check(allIds.has(edge.from), `Edge ${edge.id} has missing source ${edge.from}.`);
  check(allIds.has(edge.to), `Edge ${edge.id} has missing target ${edge.to}.`);
  check(Number.isFinite(edge.strength) && edge.strength >= 0 && edge.strength <= 1, `Edge ${edge.id} has invalid strength.`);
  check(Number.isFinite(edge.confidence) && edge.confidence >= 0 && edge.confidence <= 1, `Edge ${edge.id} has invalid confidence.`);
  check(['explicit', 'inferred'].includes(edge.assertion), `Edge ${edge.id} has invalid assertion status.`);
  const evidence = edge.evidence;
  check(evidence && sourceIds.has(evidence.sourceDocumentId), `Edge ${edge.id} has an undeclared evidence source.`);
  check(evidence && validRange(evidence.printedPages), `Edge ${edge.id} has an invalid evidence page range.`);
  const section = sections.get(evidence?.sectionId);
  check(section, `Edge ${edge.id} points to undeclared evidence section ${evidence?.sectionId}.`);
  if (section) check(inRange(evidence.printedPages, section.provenance.printedPages), `Edge ${edge.id} has pages outside ${evidence.sectionId}.`);
  if (edge.assertion === 'inferred') check(edge.confidence < 1, `Inferred edge ${edge.id} cannot have confidence 1.`);
}

const requiredKinds = ['passage', 'quotation', 'figure', 'code-fragment'];
for (const kind of requiredKinds) check(hyperbook.objects.some((object) => object.kind === kind), `Sample has no ${kind} specimen.`);

if (errors.length) {
  console.error(`Phase 1 sample validation failed (${errors.length} issue${errors.length === 1 ? '' : 's'}):`);
  errors.forEach((error) => console.error(`- ${error}`));
  process.exitCode = 1;
} else {
  console.log(`Phase 1 sample valid: ${hyperbook.objects.length} book objects, ${vocabulary.entities.length} controlled entities, ${edgeArtifact.edges.length} edges.`);
}
