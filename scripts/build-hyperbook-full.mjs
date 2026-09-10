#!/usr/bin/env node
/**
 * Build the reviewable full-book Hyperbook artifacts from the supplied PDF's
 * text extraction. This is deliberately deterministic and has no runtime role
 * in the static site. Run `pdftotext -raw <pdf> tmp/.../book-raw.txt` first.
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const input = process.argv[2] || path.join(root, 'tmp/hyperbook-extraction/book-raw.txt');
const output = path.join(root, 'data/hyperbook');
const slug = (value) => value.normalize('NFKD').replace(/[\u0300-\u036f]/g, '').toLowerCase()
  .replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '');
const range = (start, end = start) => [start, end];
const sourceId = 'source:hypercities-thick-mapping-2014';

// These ranges are editorially chosen coherent units, not an automated
// paragraph split. Together they cover every substantive printed page.
const sections = [
  ['section:preface', 'Preface', 6, 11, 'chapter'],
  ['section:lexicon', 'Lexicon', 12, 21, 'chapter'],
  ['section:humanities-digital-humanities', 'The Humanities in the Digital Humanities', 22, 65, 'chapter'],
  ['section:windows-los-angeles', 'Windows: Los Angeles', 66, 83, 'windows'],
  ['section:view-above-below', 'The View from Above / Below', 84, 127, 'chapter'],
  ['section:windows-rome-tehran', 'Windows: Rome and Tehran', 128, 139, 'windows'],
  ['section:mapping-events', 'Mapping Events / Mapping Social Media', 140, 183, 'chapter'],
  ['section:gallery-tohoku', 'Gallery: A Journey through Tohoku, Japan', 184, 203, 'gallery'],
  ['section:apparatus', 'Endnotes, Acknowledgments, and Credits', 204, 212, 'apparatus']
];

const passagePlan = [
  ['section:preface', 6, 7, 'Hyper, multiplicity, and digital mapping', ['voice:todd-presner']],
  ['section:preface', 8, 9, 'Methods, embodiment, and the scale of view', ['voice:todd-presner']],
  ['section:preface', 10, 11, 'A polyvocal book built with digital forms', ['voice:todd-presner','voice:david-shepard','voice:yoh-kawano']],
  ['section:lexicon', 12, 14, 'HyperCities: narratives through place and time', ['voice:todd-presner']],
  ['section:lexicon', 15, 19, 'Thick Mapping: mapping as ongoing practice', ['voice:todd-presner']],
  ['section:lexicon', 20, 21, 'Digital humanities and an open future', ['voice:todd-presner']],
  ['section:humanities-digital-humanities', 22, 24, 'The flâneur and the mediated city', ['voice:todd-presner']],
  ['section:humanities-digital-humanities', 25, 26, 'Berlin, ruins, and what remains', ['voice:todd-presner']],
  ['section:humanities-digital-humanities', 27, 30, 'Berlin as a temporal and spatial palimpsest', ['voice:todd-presner']],
  ['section:humanities-digital-humanities', 31, 34, 'Berlin: Temporal Topographies and Hypermedia Berlin', ['voice:todd-presner']],
  ['section:humanities-digital-humanities', 35, 37, 'Readerly and writerly webs', ['voice:todd-presner']],
  ['section:humanities-digital-humanities', 38, 41, 'APIs, data, and a geotemporal platform', ['voice:david-shepard']],
  ['section:humanities-digital-humanities', 42, 48, 'From platforms to public participation', ['voice:todd-presner','voice:david-shepard']],
  ['section:humanities-digital-humanities', 49, 53, 'Thick Mapping between GIS and critique', ['voice:todd-presner']],
  ['section:humanities-digital-humanities', 54, 57, 'Zoom and thickness as historical methods', ['voice:todd-presner']],
  ['section:humanities-digital-humanities', 58, 62, 'The Pharus map, railways, and non-simultaneity', ['voice:todd-presner']],
  ['section:humanities-digital-humanities', 63, 65, 'Anhalter Bahnhof and historical disruption', ['voice:todd-presner']],
  ['section:windows-los-angeles', 66, 67, 'Los Angeles Ghost Maps: layered places', ['voice:phil-ethington']],
  ['section:windows-los-angeles', 68, 71, 'Ghost neighborhoods, traces, and the archive', ['voice:phil-ethington']],
  ['section:windows-los-angeles', 72, 75, 'Ghost maps as historical argument', ['voice:phil-ethington']],
  ['section:windows-los-angeles', 76, 78, 'PDub and Historic Filipinotown', ['voice:pdub-contributors']],
  ['section:windows-los-angeles', 79, 81, 'Youth media, neighborhood, and participation', ['voice:pdub-contributors']],
  ['section:windows-los-angeles', 82, 83, 'PDub mapping and mobile narratives', ['voice:pdub-contributors']],
  ['section:view-above-below', 84, 87, 'Google Earth and the view from above', ['voice:todd-presner']],
  ['section:view-above-below', 88, 91, 'Panoramas, remote seeing, and visuality', ['voice:todd-presner']],
  ['section:view-above-below', 92, 95, 'Digital globes and the Apollonian eye', ['voice:todd-presner']],
  ['section:view-above-below', 96, 100, 'Global totality, code, and the geospatial web', ['voice:david-shepard','voice:todd-presner']],
  ['section:view-above-below', 101, 105, 'Keyhole, Google Earth, and projection choices', ['voice:david-shepard','voice:todd-presner']],
  ['section:view-above-below', 106, 109, 'Counter-Mapping', ['voice:todd-presner']],
  ['section:view-above-below', 110, 113, 'Georeferencing: turtles all the way down', ['voice:todd-presner']],
  ['section:view-above-below', 114, 117, 'Ōmi, control points, and spatial deformance', ['voice:todd-presner']],
  ['section:view-above-below', 118, 123, 'Ortelius, basemaps, and relational alignment', ['voice:todd-presner']],
  ['section:view-above-below', 124, 127, 'Ideologies of accuracy and counter-mapping', ['voice:todd-presner']],
  ['section:windows-rome-tehran', 128, 130, 'Rome: jumping over the line', ['voice:rome-window']],
  ['section:windows-rome-tehran', 131, 133, 'Roman Forum: embodied and 3D inquiry', ['voice:rome-window']],
  ['section:windows-rome-tehran', 134, 136, 'Tehran election protests: mapping a situated event', ['voice:xarene-eskandar']],
  ['section:windows-rome-tehran', 137, 139, 'Protest media, routes, and conflicting representations', ['voice:xarene-eskandar']],
  ['section:mapping-events', 140, 143, 'Participation without condition', ['voice:todd-presner']],
  ['section:mapping-events', 144, 146, 'Voices of January 25th and February 17th', ['voice:todd-presner']],
  ['section:mapping-events', 147, 149, 'Curation, trust, and witnessing', ['voice:todd-presner']],
  ['section:mapping-events', 150, 153, 'HyperCities Now: events with multiple temporalities', ['voice:todd-presner']],
  ['section:mapping-events', 154, 156, 'Chronos, event time, and the witness', ['voice:todd-presner']],
  ['section:mapping-events', 157, 159, 'Archive scale and the incomplete event', ['voice:todd-presner']],
  ['section:mapping-events', 160, 163, 'Egypt: a global view of event networks', ['voice:david-shepard']],
  ['section:mapping-events', 164, 167, 'Network communities and porous event boundaries', ['voice:david-shepard']],
  ['section:mapping-events', 168, 171, 'Algorithms, archives, and event interpretation', ['voice:david-shepard']],
  ['section:mapping-events', 172, 175, 'Japan disaster response and retweet networks', ['voice:yoh-kawano']],
  ['section:mapping-events', 176, 179, 'Zooming Twitter data from Japan', ['voice:yoh-kawano','voice:david-shepard']],
  ['section:mapping-events', 180, 183, 'Emotion, aggregation, and what a chart obscures', ['voice:yoh-kawano']],
  ['section:gallery-tohoku', 184, 185, 'A journey through Tohoku: distance and proximity', ['voice:yoh-kawano']],
  ['section:gallery-tohoku', 186, 188, 'Yuriage: a recovered physical archive', ['voice:yoh-kawano']],
  ['section:gallery-tohoku', 189, 192, 'Okawa: mourning, memory, and memorial space', ['voice:yoh-kawano']],
  ['section:gallery-tohoku', 193, 195, 'Inside the nuclear evacuation zone', ['voice:yoh-kawano']],
  ['section:gallery-tohoku', 196, 197, 'Bishamon: mobile radiation measurement', ['voice:yoh-kawano']],
  ['section:gallery-tohoku', 198, 201, 'Fukushima, Namie, and an evacuated city', ['voice:yoh-kawano']],
  ['section:gallery-tohoku', 202, 203, 'The event remains', ['voice:yoh-kawano']]
];

const vocabulary = [
  // Narrative voices
  ['voice:todd-presner','narrative-voice','Todd Presner',['TP','Todd Presner']],
  ['voice:david-shepard','narrative-voice','David Shepard',['DS','David Shepard']],
  ['voice:yoh-kawano','narrative-voice','Yoh Kawano',['YK','Yoh Kawano']],
  ['voice:phil-ethington','narrative-voice','Phil Ethington',['Phil Ethington','Philip Ethington']],
  ['voice:pdub-contributors','narrative-voice','PDub contributors',['PDub','PDub Productions']],
  ['voice:rome-window','narrative-voice','Rome window contributors',['Rome: Jumping over the Line','Rome: Jumping Over the Line']],
  ['voice:xarene-eskandar','narrative-voice','Xárene Eskandar',['Xárene Eskandar','Eskandar']],
  // Concepts
  ['concept:hypercities','concept','HyperCities',['HyperCities']],
  ['concept:thick-mapping','concept','thick mapping',['thick mapping','Thick Mapping']],
  ['concept:flaneur','concept','flâneur',['flâneur','flaneur']],
  ['concept:multiplicity','concept','multiplicity',['multiplicity','multiple','multitudes']],
  ['concept:heterogeneity','concept','heterogeneity',['heterogeneity','heterogeneous']],
  ['concept:ambiguity','concept','ambiguity',['ambiguity','ambiguous']],
  ['concept:palimpsest','concept','palimpsest',['palimpsest','palimpsests']],
  ['concept:ghosts','concept','ghosts',['ghosts','ghost map','Ghost Maps']],
  ['concept:time-layers','concept','time-layers',['time-layers','time layers','temporal topographies']],
  ['concept:temporality','concept','temporality',['temporality','temporalities','non-simultaneous','simultaneity']],
  ['concept:zoom','concept','zoom',['zoom','Zoom']],
  ['concept:georeferencing','concept','georeferencing',['georeferencing','georectify','georectified','georectification']],
  ['concept:basemap','concept','basemap',['basemap','base-map','base map']],
  ['concept:turtles','concept','turtles all the way down',['turtles all the way down','turtle to another turtle']],
  ['concept:counter-mapping','concept','counter-mapping',['counter-mapping','Counter-Mapping']],
  ['concept:spatial-deformance','concept','spatial deformance',['spatial deformance','productive deformance']],
  ['concept:representation','concept','representation',['representation','representations','representational']],
  ['concept:memory','concept','memory',['memory','memories','remember']],
  ['concept:archive','concept','archive',['archive','archiving','archival']],
  ['concept:participation','concept','participation',['participation','participatory']],
  ['concept:witnessing','concept','witnessing',['witness','witnesses','eyewitness']],
  ['concept:event','concept','event',['event','events']],
  ['concept:contingency','concept','contingency',['contingency','contingent']],
  ['concept:open-future','concept','open future',['open to possibilities','future remains open','future to come']],
  ['concept:polyvocality','concept','polyvocality',['polyvocal','many voices','every voice']],
  ['concept:network','concept','networks',['network','networks']],
  ['concept:public-humanities','concept','public humanities',['public humanities','public mission','public sphere']],
  ['concept:authority','concept','authority',['authority','authoritative']],
  ['concept:accuracy','concept','accuracy',['accuracy','accurate']],
  ['concept:scale','concept','scale',['scale','macro-level','micro-level','global view']],
  ['concept:relation','concept','relation',['relation','relations','relational']],
  ['concept:absence','concept','absence',['absence','erasure','erased']],
  ['concept:presence','concept','presence',['presence','present']],
  ['concept:care','concept','care',['care','curation','stewardship']],
  ['concept:embodiment','concept','embodiment',['embodied','body-at-risk','bodies']],
  ['concept:openness','concept','openness',['open-ended','unbounded','open field']],
  ['concept:digital-humanities','concept','digital humanities',['digital humanities','Digital Humanities']],
  ['concept:spatial-turn','concept','spatial turn',['spatial turn','spatiality']],
  ['concept:media-archaeology','concept','media archaeology',['media archaeology','Media Archaeology']],
  ['concept:spatial-epistemology','concept','spatial epistemology',['spatial epistemology','epistemologies']],
  ['concept:ideology','concept','ideology',['ideology','ideologies','ideological']],
  ['concept:decolonization','concept','decolonization',['decolonization','decolonize']],
  ['concept:public-sphere','concept','public sphere',['public sphere']],
  ['concept:social-media','concept','social media',['social media','Social Media']],
  // People
  ['person:walter-benjamin','person','Walter Benjamin',['Walter Benjamin','Benjamin']],
  ['person:charles-baudelaire','person','Charles Baudelaire',['Charles Baudelaire','Baudelaire']],
  ['person:edgar-allan-poe','person','Edgar Allan Poe',['Edgar Allan Poe','Poe']],
  ['person:theodor-nelson','person','Theodor Nelson',['Theodor Nelson','Nelson']],
  ['person:clifford-geertz','person','Clifford Geertz',['Clifford Geertz','Geertz']],
  ['person:edward-said','person','Edward Said',['Edward Said','Said']],
  ['person:susan-sontag','person','Susan Sontag',['Susan Sontag','Sontag']],
  ['person:paul-virilio','person','Paul Virilio',['Paul Virilio','Virilio']],
  ['person:william-gibson','person','William Gibson',['William Gibson','Gibson']],
  ['person:lev-manovich','person','Lev Manovich',['Lev Manovich','Manovich']],
  ['person:richard-white','person','Richard White',['Richard White']],
  ['person:john-scott-railton','person','John Scott-Railton',['John Scott-Railton','Scott-Railton']],
  ['person:yugo-shobugawa','person','Yugo Shobugawa',['Yugo Shobugawa','Yugo']],
  ['person:mahmoud-ahmadinejad','person','Mahmoud Ahmadinejad',['Mahmoud Ah- madinejad','Mahmoud Ahmadinejad']],
  ['person:romulus','person','Romulus',['Romulus']],
  // Places. Broad country labels remain source entities but are explicitly barred as spatial fallback targets below.
  ['place:berlin','place','Berlin',['Berlin'], 'city'],
  ['place:los-angeles','place','Los Angeles',['Los Angeles'], 'city'],
  ['place:downtown-los-angeles','place','Downtown Los Angeles',['Downtown Los Angeles','downtown Los Angeles'], 'district'],
  ['place:historic-filipinotown','place','Historic Filipinotown',['Historic Filipinotown','HiFi'], 'district'],
  ['place:rome','place','Rome',['Rome'], 'city'],
  ['place:tehran','place','Tehran',['Tehran'], 'city'],
  ['place:cairo','place','Cairo',['Cairo','Tahrir Square'], 'city'],
  ['place:egypt','place','Egypt',['Egypt','Egyptian'], 'country'],
  ['place:libya','place','Libya',['Libya','Libyan'], 'country'],
  ['place:tohoku','place','Tohoku',['Tohoku'], 'region'],
  ['place:fukushima','place','Fukushima',['Fukushima'], 'region'],
  ['place:onagawa','place','Onagawa',['Onagawa'], 'city'],
  ['place:yuriage','place','Yuriage',['Yuriage'], 'site'],
  ['place:ishinomaki','place','Ishinomaki',['Ishinomaki'], 'city'],
  ['place:okawa','place','Okawa Elementary School',['Okawa'], 'site'],
  ['place:sendai','place','Sendai',['Sendai'], 'city'],
  ['place:namie','place','Namie',['Namie'], 'city'],
  ['place:iwaki','place','Iwaki',['Iwaki'], 'city'],
  ['place:niigata','place','Niigata',['Niigata'], 'city'],
  ['place:tokyo','place','Tokyo',['Tokyo'], 'city'],
  ['place:omi','place','Ōmi province',['Ōmi','Omi province'], 'region'],
  ['place:paris','place','Paris',['Paris'], 'city'],
  ['place:london','place','London',['London'], 'city'],
  ['place:west-berlin','place','West Berlin',['West Berlin'], 'district'],
  ['place:east-berlin','place','East Berlin',['East Berlin'], 'district'],
  // Projects, Windows, and technologies
  ['project:berlin-temporal-topographies','project','Berlin: Temporal Topographies',['Berlin: Temporal Topographies'], null],
  ['project:hypermedia-berlin','project','Hypermedia Berlin',['Hypermedia Berlin'], null],
  ['window:los-angeles-ghost-maps','window','Los Angeles Ghost Maps',['Los Angeles Ghost Maps'], null],
  ['project:pdub','project','PDub Productions',['PDub Productions','PDub'], null],
  ['window:rome-jumping-over-line','window','Rome: Jumping over the Line',['Rome: Jumping over the Line','Rome: Jumping Over the Line'], null],
  ['window:tehran-election-protests','window','Mapping the 2009 Election Protests in Tehran',['Mapping the 2009 Election Protests in Tehran'], null],
  ['project:hypercities-now','project','HyperCities Now',['HyperCities Now'], null],
  ['project:voices-january-25','project','Voices of January 25th',['Voices of January 25th'], null],
  ['project:voices-february-17','project','Voices of February 17th',['Voices of February 17th'], null],
  ['project:digital-archive-japan-2011','project','Digital Archive of Japan’s 2011 Disasters',["Digital Archive of Japan’s 2011 Disasters", "Digital Archive of Japan's 2011 Disasters"], null],
  ['project:bishamon','project','Bishamon',['Bishamon'], null],
  ['project:t-races','project','T-RACES',['T-RACES'], null],
  ['technology:google-earth','technology','Google Earth',['Google Earth'], null],
  ['technology:google-maps','technology','Google Maps',['Google Maps'], null],
  ['technology:gis','technology','GIS',['GIS','Geographic Information Systems'], null],
  ['technology:arcgis','technology','ArcGIS / ArcMap',['ArcGIS','ArcMap'], null],
  ['technology:openstreetmap','technology','OpenStreetMap',['OpenStreetMap'], null],
  ['technology:openlayers','technology','OpenLayers',['OpenLayers'], null],
  ['technology:ajax','technology','AJAX',['AJAX','XmlHttpRequest'], null],
  ['technology:api','technology','API',['API','APIs'], null],
  ['technology:twitter','technology','Twitter',['Twitter','tweet','tweets','retweet'], null],
  ['technology:youtube','technology','YouTube',['YouTube'], null],
  ['technology:gps','technology','GPS',['GPS'], null],
  ['technology:mercator','technology','Mercator projection',['Mercator','Spherical Mercator'], null],
  ['technology:wgs84','technology','WGS 84',['WGS:84','WGS 84'], null],
  // Events and temporal references
  ['event:berlin-wall-fall','event','Fall of the Berlin Wall',['Berlin Wall tumble','fall of the Berlin Wall'], null],
  ['event:tehran-election-protests-2009','event','2009 Tehran election protests',['election protests','June 16, 2009'], null],
  ['event:egyptian-revolution-2011','event','Egyptian Revolution',['Egyptian revolution','January 25, 2011'], null],
  ['event:japan-earthquake-tsunami-2011','event','2011 Japan earthquake and tsunami',['earthquake and tsunami','March 11, 2011'], null],
  ['event:fukushima-nuclear-disaster','event','Fukushima nuclear disaster',['nuclear meltdown','nuclear evacuation zone','nuclear emergency'], null],
  ['time-range:mid-nineteenth-century','time-range','mid-nineteenth century',['mid-nineteenth century'], null],
  ['time-range:twentieth-century','time-range','twentieth century',['twentieth century'], null],
  ['time-range:twenty-first-century','time-range','twenty-first century',['twenty-first century'], null]
  ,['date:1237','date','1237',['1237'], null]
  ,['date:1811','date','1811',['1811'], null]
  ,['date:1850','date','1850',['1850'], null]
  ,['date:1905','date','1905',['1905'], null]
  ,['date:1920','date','1920',['1920'], null]
  ,['date:1926','date','1926',['1926'], null]
  ,['date:1936','date','1936',['1936'], null]
  ,['date:1945','date','1945',['1945'], null]
  ,['date:1990','date','1990',['1990'], null]
  ,['date:2000','date','2000',['2000'], null]
  ,['date:2004','date','2004',['2004'], null]
  ,['date:2009','date','2009',['2009'], null]
  ,['date:2010','date','2010',['2010'], null]
  ,['date:2011','date','2011',['2011'], null]
  ,['date:2012','date','2012',['2012'], null]
  ,['date:2013','date','2013',['2013'], null]
];

const interactionRules = [
  ['wander', /flâneur|flaneur|walked|streets|strolled|travel(?:ed|ing)?/i, ['move-within-place','lateral-traverse']],
  ['descend', /downward in time|drill down|underground|buried|descent/i, ['core-depth','move-earlier']],
  ['surface', /surface|rise above|look down|above\/below/i, ['move-later','surface-to-basemap']],
  ['zoom', /zoom(?:ed|ing)?|macro-level|micro-level|global view/i, ['zoom-change']],
  ['compare', /align|overlay|overlaid|compare|comparison|control points/i, ['raster-basemap-alignment','compare-representations']],
  ['revisit', /remains|return|recollect|memory|memories|remember/i, ['return-to-place','revisit-trace']],
  ['layer', /layers|layered|palimpsest|stack(?:s|ed)?|multiplicity/i, ['core-depth-many','select-temporal-layer']],
  ['drift', /non-contiguous|distant|faraway|across.*space|simultaneity/i, ['lateral-drift','same-time-juxtaposition']],
  ['witness', /witness|voice|testimony|testimonies|bear witness/i, ['encounter-voice','open-provenance']]
];
const temporalRules = [
  ['historical-change', /history|historical|past|present|future/i],
  ['time-layering', /time-layers|temporal topographies|palimpsest|non-simultaneous|simultaneity/i],
  ['event-time', /event|chronos|hour|minute|second|day-by-day/i],
  ['memory-time', /memory|memories|remember|remains/i],
  ['open-future', /open.*future|future.*open|possibilit/i]
];
const cartographicRules = [
  ['mapping', /map(?:s|ping)?|cartograph/i],
  ['georeferencing', /georeferenc|georectif|control points/i],
  ['basemap', /basemap|base-map|Google Maps|Google Earth/i],
  ['projection', /projection|Mercator|coordinate system|WGS/i],
  ['scale-and-zoom', /zoom|scale|macro-level|micro-level/i],
  ['representation', /representation|representational|accuracy|distortion/i],
  ['archive', /archive|archival|data(?:set)?|metadata/i],
  ['network', /network|API|platform|Twitter/i]
];

const normalize = (text) => text
  .replace(/([\p{L}])-[\n\r]+\s*([\p{L}])/gu, '$1$2')
  .replace(/([\p{L}])-\s+([\p{L}])/gu, '$1$2')
  .replace(/[\n\r]+/g, ' ')
  .replace(/\s+/g, ' ')
  .replace(/\s+([,.;:!?])/g, '$1')
  .trim();
const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matchAliases = (text, aliases) => aliases.flatMap((alias) => {
  const rx = new RegExp(`(?<![\\p{L}\\p{N}])${escape(alias)}(?![\\p{L}\\p{N}])`, 'giu');
  return [...text.matchAll(rx)].map((m) => ({ alias, index: m.index }));
});
const snippets = (text) => {
  const clean = text
    .replace(/^\s*HyperCities: Thick Mapping in the Digital Humanities\s+\d{1,3}\s*/i, '')
    .replace(/^\s*(?:PREFACE|LEXICON|THE HUMANITIES IN THE DIGITAL HUMANITIES|THE VIEW FROM ABOVE\s*\/\s*BELOW|MAPPING EVENTS\s*\/\s*MAPPING SOCIAL MEDIA|WINDOWS|GALLERY)\s*/i, '')
    .replace(/^\s*Preface\s+\(TP\)\s*/i, '')
    .replace(/^\s*Lexicon\s+[–—\-\s]+HyperCities\s*/i, '')
    .replace(/\b(?:HyperCities: Thick Mapping in the Digital Humanities|PREFACE|LEXICON|THE HUMANITIES IN THE DIGITAL HUMANITIES|THE VIEW FROM ABOVE \/ BELOW|MAPPING EVENTS \/ MAPPING SOCIAL MEDIA|WINDOWS|GALLERY)\b/g, ' ')
    .replace(/\s+/g, ' ').trim();
  const protectedInitials = clean.replace(/\b([A-Z])\./g, '$1∯');
  return (protectedInitials.match(/[^.!?]+[.!?]+(?:[””'\)\]]+)?/g) || [])
    .map((sentence) => sentence.replace(/∯/g, '.').replace(/^\s*[^.!?]{0,160}\((?:TP|DS|YK)\)\s+/, ''));
};
const sentenceScore = (sentence) => {
  const length = sentence.length;
  if (length < 54 || length > 330 || /(?:endnotes|acknowledgments|credits)/i.test(sentence)) return -99;
  if (/^\s*(?:Book Ghost Map|Map Call-Out|Fig(?:ure)?\.?|W\s*(?:\d+\s+)?|G\s+We follow|All\s*,|\(?\d+\)?\s*$|\(?\d+\)?\s+)/i.test(sentence)) return -99;
  if (/\b(?:Map Call-Out|Book Ghost Map|\bW\s+PDub|\bG\s+We follow|\bC\.)/i.test(sentence)) return -99;
  if (/^\s*[a-z]/.test(sentence)) return -99;
  if (/(?:\b[a-z]\s+){3,}[a-z]\b/i.test(sentence) || /\b(?:H e|U n|t h e|b y|o f)\b/.test(sentence)) return -99;
  let score = 0;
  for (const [, , , aliases] of vocabulary) if (matchAliases(sentence, aliases).length) score += 2;
  for (const [, rx] of interactionRules) if (rx.test(sentence)) score += 4;
  for (const [, rx] of temporalRules) if (rx.test(sentence)) score += 3;
  for (const [, rx] of cartographicRules) if (rx.test(sentence)) score += 3;
  if (/\b(?:what if|never|always|not merely|rather|possible|cannot|infinite|open)\b/i.test(sentence)) score += 3;
  if (/^\s*(?:and|but|or|the|a)\s/i.test(sentence)) score -= 2;
  return score;
};
const evidence = (sectionId, pages, note) => ({ sourceDocumentId: sourceId, sectionId, printedPages: pages, locator: `Printed pp. ${pages[0]}${pages[0] === pages[1] ? '' : `–${pages[1]}`}`, note });
const sectionForPage = (page) => sections.find(([, , start, end]) => page >= start && page <= end);

const raw = await readFile(input, 'utf8');
const pages = raw.split('\f').map(normalize);
if (pages.length < 203) throw new Error(`Expected 203+ PDF pages in ${input}; found ${pages.length}.`);
const pdfHash = createHash('sha256').update(await readFile(path.join(root, 'eScholarship UC item 3mh5t455.pdf'))).digest('hex');
const pageText = (start, end) => pages.slice(start - 1, end).join(' ');

const objects = [];
for (const [id, title, start, end, kind] of sections) {
  objects.push({ id, kind, title, provenance: evidence(id, range(start, end), 'Book hierarchy boundary.'), sourceUnit: 'book section' });
}
const passages = passagePlan.map(([sectionId, start, end, title, voices], index) => {
  const id = `passage:${String(index + 1).padStart(3, '0')}-${slug(title)}`;
  const entry = { id, kind: 'passage', title, sectionId, narrativeVoiceIds: voices, scholarlyUnit: 'coherent thematic unit', provenance: evidence(sectionId, range(start, end), 'Curated page-range unit; not an automated paragraph split.'), sourceTextHash: createHash('sha256').update(pageText(start, end)).digest('hex') };
  objects.push(entry);
  return entry;
});

// Figure citations are intentionally references, not reconstructed image data.
const figureSeen = new Map();
for (let page = 6; page <= 203; page++) {
  for (const match of pageText(page, page).matchAll(/\bFig(?:s)?\.\s*(\d+)(?:\s*\/\s*(\d+))?/gi)) {
    for (const number of [match[1], match[2]].filter(Boolean)) {
      if (!figureSeen.has(number)) figureSeen.set(number, page);
    }
  }
}
for (const [number, page] of figureSeen) {
  const [sectionId] = sectionForPage(page);
  objects.push({ id: `figure:${number}`, kind: 'figure-reference', title: `Figure ${number}`, figureNumber: Number(number), provenance: evidence(sectionId, range(page), 'Figure reference detected in the book text; image pixels are not republished in this graph.'), verificationStatus: 'source-page-reference' });
}
const codeObjects = [
  ['code:ajax-post','AJAX post request',38,'JavaScript', 'post( “ ./provider/objects/4023” , metadata, _updateReturn, “json”);'],
  ['code:coordinate-parser','Coordinate parser',96,'JavaScript','coords = this._getTagValue(xml, namespacePrefix + “coordinates”);'],
  ['code:zero-height-field','Zero height field',120,'JavaScript','Zero Height Field']
].map(([id,title,page,language,transcription]) => {
  const [sectionId] = sectionForPage(page);
  const o={id,kind:'code-fragment',title,language,transcription,transcriptionStatus:'layout-sensitive transcription from source page; human review required before display',provenance:evidence(sectionId,range(page),'Code or code-adjacent fragment as printed.')}; objects.push(o); return o;
});

const entities = vocabulary.map(([id,type,preferredLabel,aliases,placeScale]) => {
  const first = [];
  let count = 0;
  for (let page=6; page<=203; page++) {
    const matches = matchAliases(pageText(page,page), aliases);
    if (matches.length) { count += matches.length; if (!first.length) first.push(page); }
  }
  const page = first[0] ?? 6;
  const [sectionId] = sectionForPage(page);
  return { id, type, preferredLabel, aliases: [...new Set(aliases)], assertion:'book-explicit', mentionCount:count, placeScale:placeScale || undefined, provenance:evidence(sectionId,range(page),'First literal or named mention detected in the supplied edition.') };
}).filter((e) => e.mentionCount > 0 || e.type === 'narrative-voice');
const entityById = new Map(entities.map((e) => [e.id,e]));

const edges=[]; let edgeNumber=0;
const addEdge=(from,to,relationType,assertion,confidence,strength,ev,note)=>edges.push({id:`edge:${String(++edgeNumber).padStart(5,'0')}`,from,to,relationType,assertion,confidence,strength,evidence:{...ev,note}});
for (const passage of passages) {
  addEdge(passage.sectionId,passage.id,'contains','book-explicit','high','strong',passage.provenance,'Passage belongs to this book section.');
  for (const voiceId of passage.narrativeVoiceIds.filter((id)=>entityById.has(id))) addEdge(passage.id,voiceId,'narrated-by','book-explicit','high','moderate',passage.provenance,'Narrative voice identified by the printed initials or named window attribution.');
  const text=pageText(...passage.provenance.printedPages);
  for (const entity of entities) {
    const hits=matchAliases(text,entity.aliases);
    if (!hits.length || entity.type==='narrative-voice') continue;
    addEdge(passage.id,entity.id,'mentions','book-explicit','high',hits.length > 2 ? 'strong':'moderate',passage.provenance,`Literal source mention: ${[...new Set(hits.map(h=>h.alias))].join(', ')}.`);
  }
}
for (const figure of objects.filter(o=>o.kind==='figure-reference')) {
  const p=passages.find(x=>x.provenance.printedPages[0] <= figure.provenance.printedPages[0] && x.provenance.printedPages[1] >= figure.provenance.printedPages[0]);
  if (p) addEdge(p.id,figure.id,'references','book-explicit','high','light',figure.provenance,'Figure reference occurs within this passage range.');
}
for (const code of codeObjects) {
  const p=passages.find(x=>x.provenance.printedPages[0] <= code.provenance.printedPages[0] && x.provenance.printedPages[1] >= code.provenance.printedPages[0]);
  if (p) addEdge(p.id,code.id,'contains','book-explicit','high','moderate',code.provenance,'Code fragment occurs within this passage range.');
}
// Interpretive indexing is intentionally modest: two concepts literal in the
// same coherent passage may be offered as related, but this is never presented
// as a formal statement made by the book.
for (const passage of passages) {
  const text=pageText(...passage.provenance.printedPages);
  const concepts=entities.filter((e)=>e.type==='concept' && matchAliases(text,e.aliases).length)
    .sort((a,b)=>matchAliases(text,b.aliases).length-matchAliases(text,a.aliases).length).slice(0,5);
  for (let i=0;i<concepts.length;i++) for(let j=i+1;j<concepts.length && j<i+3;j++) {
    addEdge(concepts[i].id,concepts[j].id,'co-articulated-with','book-inferred','medium','light',passage.provenance,
      'Interpretive index: both concepts are literally present in this coherent passage. This does not assert a formal source definition of their relation.');
  }
}

// Exact encounter candidates are selected from full sentences in each curated
// passage. Their text is never model-written; the normalized source extraction
// and page range remain attached for checking against the PDF.
const quotations=[]; const encounters=[]; let quoteNumber=0;
for (const passage of passages) {
  const passagePages=passage.provenance.printedPages;
  const candidates=[];
  for (let page=passagePages[0]; page<=passagePages[1]; page++) {
    snippets(pageText(page,page)).forEach((text,index)=>candidates.push({text:text.trim(),index,page,score:sentenceScore(text)}));
  }
  const rankedCandidates=candidates.filter(x=>x.score>=5).sort((a,b)=>b.score-a.score || a.index-b.index);
  const selected=[];
  for (const candidate of rankedCandidates) {
    const normalized=candidate.text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
    if (selected.some((item)=>item.normalized===normalized || item.normalized.includes(normalized) || normalized.includes(item.normalized))) continue;
    selected.push({...candidate,normalized});
    if (selected.length===3) break;
  }
  if (!selected.length) {
    const fallback=candidates.find(s=>s.length>=48 && s.length<=330 && sentenceScore(s)>-10);
    if (fallback) selected.push({...fallback,score:0,normalized:fallback.text.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim()});
  }
  for (const candidate of selected) {
    const qid=`quote:${String(++quoteNumber).padStart(3,'0')}-${slug(candidate.text.slice(0,52))}`;
    const quoteProvenance=evidence(passage.sectionId,range(candidate.page),`Exact quotation candidate inside parent passage ${passage.id}; parent passage spans printed pp. ${passagePages[0]}–${passagePages[1]}.`);
    const quote={id:qid,kind:'quotation',text:candidate.text,sourcePassageId:passage.id,narrativeVoiceIds:passage.narrativeVoiceIds,provenance:quoteProvenance,transcriptionStatus:'normalized text extraction; page image / PDF review required before publication as a typeset quotation'};
    quotations.push(quote); objects.push(quote);
    addEdge(passage.id,qid,'contains','book-explicit','high','moderate',passage.provenance,'Exact normalized sentence extracted from this passage range.');
    const eid=`encounter:${String(encounters.length+1).padStart(3,'0')}`;
    encounters.push({id:eid,kind:'quotation',displayText:candidate.text,sourceObjectId:qid,sourcePassageId:passage.id,sectionId:passage.sectionId,provenance:quoteProvenance,sourceStatus:'book-explicit',displaySafety:'source text only; do not silently shorten or paraphrase',editorialSuitability:candidate.score>=12?'strong':'consider'});
  }
}
// These short, central sentences are manually retained because the source's
// typographic treatment can make a pure sentence scorer miss them. They still
// pass the same literal page-text provenance check as every other quotation.
const canonicalQuoteSpecs = [
  [15, 'Mapping is not a one-time thing, and maps are not stable objects that reference, reflect, or correspond to an external reality.'],
  [23, 'As the flâneur walked along the streets, he was conducted downward in time.'],
  [69, 'The historian who maps the past makes these ghosts visible.'],
  [110, 'The second definition is a story of infinite regress, in which absolutes and origins are never found: it is turtles all the way down.'],
  [111, 'Aligning one representation with another representation does not yield a truth, but produces a relation, which allows a series of questions to be asked and various kinds of analyses to be undertaken.'],
  [150, 'The event has no end (time).'],
  [203, 'The event remains.']
];
for (const [page,text] of canonicalQuoteSpecs) {
  if (!pages[page-1].includes(text)) throw new Error(`Canonical quotation not found on printed p. ${page}: ${text}`);
  if (quotations.some((q)=>q.text===text)) continue;
  const passage=passages.find((p)=>p.provenance.printedPages[0]<=page&&p.provenance.printedPages[1]>=page);
  const qid=`quote:${String(++quoteNumber).padStart(3,'0')}-${slug(text.slice(0,52))}`;
  const quoteProvenance=evidence(passage.sectionId,range(page),`Manually retained canonical quotation inside parent passage ${passage.id}.`);
  const quote={id:qid,kind:'quotation',text,sourcePassageId:passage.id,narrativeVoiceIds:passage.narrativeVoiceIds,provenance:quoteProvenance,transcriptionStatus:'normalized text extraction; page image / PDF review required before publication as a typeset quotation',curationNote:'Manually retained central source sentence.'};
  quotations.push(quote); objects.push(quote);
  addEdge(passage.id,qid,'contains','book-explicit','high','strong',quoteProvenance,'Manually retained exact source quotation.');
  encounters.push({id:`encounter:${String(encounters.length+1).padStart(3,'0')}`,kind:'quotation',displayText:text,sourceObjectId:qid,sourcePassageId:passage.id,sectionId:passage.sectionId,provenance:quoteProvenance,sourceStatus:'book-explicit',displaySafety:'source text only; do not silently shorten or paraphrase',editorialSuitability:'strong'});
}
// A named passage is also a selectable encounter, but only where it expresses a
// useful intellectual orientation rather than being a generic running header.
for (const passage of passages) encounters.push({id:`encounter:${String(encounters.length+1).padStart(3,'0')}`,kind:'passage-title',displayText:passage.title,sourceObjectId:passage.id,sourcePassageId:passage.id,sectionId:passage.sectionId,provenance:passage.provenance,sourceStatus:'book-explicit',displaySafety:'heading / editorial unit label, not a quotation',editorialSuitability:'consider'});
for (const entity of entities.filter(e=>['concept','person','project','window','event'].includes(e.type))) encounters.push({id:`encounter:${String(encounters.length+1).padStart(3,'0')}`,kind:entity.type,displayText:entity.preferredLabel,sourceObjectId:entity.id,sourcePassageId:null,sectionId:entity.provenance.sectionId,provenance:entity.provenance,sourceStatus:'book-explicit',displaySafety:'controlled vocabulary label; not a quotation',editorialSuitability:'consider'});

const affordances=[]; let affordanceNumber=0;
const addAff=(encounter,dimension,tag,sourceTerms,stateCues,confidence='medium',strength='moderate')=>affordances.push({
  id:`affordance:${String(++affordanceNumber).padStart(4,'0')}`,encounterId:encounter.id,dimension,tag,assertion:'editorial',confidence,strength,
  sourceBasis:{assertion:'book-explicit',sourceObjectId:encounter.sourceObjectId,sourcePassageId:encounter.sourcePassageId,provenance:encounter.provenance,matchedTerms:sourceTerms},
  activation:{stateCues,selectionNotes:'A resonance proposal for a future Experience Graph, not a claim made by the book.'}
});
const passageById=new Map(passages.map(x=>[x.id,x]));
for (const encounter of encounters) {
  const passage=encounter.sourcePassageId ? passageById.get(encounter.sourcePassageId) : null;
  const text=encounter.kind === 'quotation' ? encounter.displayText : [encounter.displayText, passage ? pageText(...passage.provenance.printedPages) : ''].join(' ');
  for (const [tag,rx,cues] of interactionRules) if (rx.test(text)) addAff(encounter,'interactional',tag,[tag],cues,'medium',tag==='layer'||tag==='zoom'?'strong':'moderate');
  for (const [tag,rx] of temporalRules) if (rx.test(text)) addAff(encounter,'temporal',tag,[tag],tag==='time-layering'?['core-depth-many','select-temporal-layer']:['select-map','move-earlier-or-later']);
  for (const [tag,rx] of cartographicRules) if (rx.test(text)) addAff(encounter,'cartographic',tag,[tag],tag==='georeferencing'?['raster-basemap-alignment']:['select-map','compare-representations']);
  for (const entity of entities.filter(e=>e.type==='concept')) {
    const hits=matchAliases(text,entity.aliases); if (hits.length) addAff(encounter,'conceptual',entity.id.replace('concept:',''),[...new Set(hits.map(h=>h.alias))],['conceptual-continuity','novelty-filter'],hits.length>2?'high':'medium',hits.length>3?'strong':'moderate');
  }
  for (const place of entities.filter(e=>e.type==='place' && e.placeScale!=='country')) {
    const hits=matchAliases(text,place.aliases); if (hits.length) addAff(encounter,'spatial',place.id.replace('place:',''),[...new Set(hits.map(h=>h.alias))],['direct-place-match-only'], 'high','strong');
  }
}

const typeCounts=(items,key)=>Object.fromEntries(Object.entries(items.reduce((a,item)=>{const k=item[key]||'unknown';a[k]=(a[k]||0)+1;return a;},{})).sort((a,b)=>b[1]-a[1]));
const incident=new Map(); for (const edge of edges) { incident.set(edge.from,(incident.get(edge.from)||0)+1); incident.set(edge.to,(incident.get(edge.to)||0)+1); }
const labelFor=(id)=>objects.find(o=>o.id===id)?.title || entityById.get(id)?.preferredLabel || id;
const hubs=[...incident.entries()].sort((a,b)=>b[1]-a[1]).slice(0,18).map(([id,count])=>({id,label:labelFor(id),incidentEdges:count}));
const placeMentions=entities.filter(e=>e.type==='place').map(e=>({id:e.id,label:e.preferredLabel,mentions:e.mentionCount,placeScale:e.placeScale})).sort((a,b)=>b.mentions-a.mentions);
const encounterByPassage=passages.map(p=>({id:p.id,title:p.title,pages:p.provenance.printedPages,encounters:encounters.filter(e=>e.sourcePassageId===p.id).length}));
const lowThreshold=Math.max(1,Math.floor(encounterByPassage.reduce((s,x)=>s+x.encounters,0)/encounterByPassage.length/2));
const phraseFrequency=new Map(); for(const e of encounters.filter(e=>e.kind==='quotation')){const k=e.displayText.toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();phraseFrequency.set(k,(phraseFrequency.get(k)||0)+1);}
const repeated=[...phraseFrequency.entries()].filter(([,count])=>count>1).map(([text,count])=>({text,count}));
const highSupply=encounterByPassage.filter(x=>x.encounters>=4).sort((a,b)=>b.encounters-a.encounters).slice(0,12);
const inferredPairs=new Map();
for (const edge of edges.filter((edge)=>edge.assertion==='book-inferred')) {
  const key=[edge.from,edge.to].sort().join('|'); inferredPairs.set(key,(inferredPairs.get(key)||0)+1);
}
const inferredRelationshipReview=[...inferredPairs.entries()].sort((a,b)=>b[1]-a[1]).slice(0,12).map(([key,count])=>({
  entities:key.split('|').map((id)=>({id,label:labelFor(id)})), passageCoarticulations:count,
  reviewNote:'Co-articulation index only. Review before using it as a directed intellectual path.'
}));
const analysis={
  schemaVersion:'0.3.0-draft',id:'analysis:hyperbook-full-book',status:'review-required',generatedAt:new Date().toISOString(),
  counts:{sections:sections.length,passages:passages.length,quotations:quotations.length,encounterFragments:encounters.length,figures:objects.filter(o=>o.kind==='figure-reference').length,codeFragments:codeObjects.length,entities:entities.length,entitiesByType:typeCounts(entities,'type'),edges:edges.length,edgesByAssertion:typeCounts(edges,'assertion'),editorialAffordances:affordances.length,affordancesByDimension:typeCounts(affordances,'dimension')},
  diversity:{majorHubs:hubs,placesByLiteralBookMention:placeMentions,exactDuplicateQuotationFragments:repeated,sourcePassagesWithHighestEncounterSupply:highSupply,inferredRelationshipReview,passagesWithFewestEncounterObjects:encounterByPassage.filter(x=>x.encounters<=lowThreshold),reviewPriorities:['Layout-heavy code and figure pages (38, 42–48, 96, 120–123, 160–171, 180–183) need extra human fragment curation.', 'Country-scale entities are tracked as book facts but excluded from spatial activation.', 'Quotation strings are normalized PDF extraction, not final typeset transcription.']},
  repetitionPolicy:{defaultCooldown:'Do not show the same sourcePassageId twice in the previous 8 encounters or the same concept in the previous 3, unless explicitly requested.',noGeographicFallback:true,selectionCanReturnNoEncounter:true}
};

const hyperbook={schemaVersion:'0.3.0-draft',id:'hyperbook:hypercities-full-book',status:'review-required',scope:'Full substantive book extraction: printed pp. 6–203. Apparatus is represented as a hierarchy object but is not mined for encounters.',sourceDocuments:[{id:sourceId,title:'HyperCities: Thick Mapping in the Digital Humanities',authors:['Todd Presner','David Shepard','Yoh Kawano'],publisher:'Harvard University Press',year:2014,sourceFile:'eScholarship UC item 3mh5t455.pdf',sha256:pdfHash,pdfPages:212,printedBookPages:[6,212],textExtraction:'pdftotext -raw, normalized only for whitespace and line-break hyphenation'}],objectKinds:['section','passage','quotation','figure-reference','code-fragment'],evidencePolicy:{bookExplicit:'Literal source text, hierarchy, or named mention with page provenance.',bookInferred:'Source-grounded interpretive relation; used sparingly in edges.',editorial:'Reserved for experience-affordances.json and never promoted to a book fact.'},objects};
const entityArtifact={schemaVersion:'0.3.0-draft',id:'vocabulary:hypercities-full-book',status:'review-required',identityPolicy:'One preferred label per recurring entity; aliases are literal source forms. Geographic entities retain their scale.',geographicSafety:'Country-scale entities must not create spatial encounter eligibility. Spatial matching requires a direct named city, district, site, or region match in the passage.',entities};
const edgeArtifact={schemaVersion:'0.3.0-draft',id:'edges:hypercities-full-book',status:'review-required',strengthVocabulary:['strong','moderate','light'],confidenceVocabulary:['high','medium','low'],assertionVocabulary:['book-explicit','book-inferred'],edges};
const encounterArtifact={schemaVersion:'0.3.0-draft',id:'encounters:hypercities-full-book',status:'review-required',purpose:'Encounter-sized source objects derived from, and always traceable to, the Hyperbook Graph. They are not interface instructions.',selectionSafeguards:{quoteText:'Quotation encounters preserve extracted source text and point to a quotation object and source passage.',noSyntheticQuotes:true,sourceCooldown:'Future selection should apply analysis.repetitionPolicy before display.',canBeSilent:true},encounters};
const affordanceArtifact={schemaVersion:'0.3.0-draft',id:'experience-affordances:hypercities-full-book',status:'review-required',purpose:'Editorial preparation for a later Experience Graph. These affordances do not modify either the Hyperbook Graph or Map Graph.',assertionPolicy:'Every affordance is editorial. sourceBasis records the specific book evidence that makes the proposal defensible.',spatialSafety:'Only direct literal city, district, site, or regional mentions create spatial affordances. Country mentions and map-library membership never do.',activationDimensions:['spatial','temporal','cartographic','interactional','conceptual'],affordances};

await mkdir(output,{recursive:true});
for (const [file,data] of Object.entries({'hyperbook.json':hyperbook,'entities.json':entityArtifact,'edges.json':edgeArtifact,'encounters.json':encounterArtifact,'experience-affordances.json':affordanceArtifact,'analysis.json':analysis})) await writeFile(path.join(output,file),`${JSON.stringify(data,null,2)}\n`);
console.log(JSON.stringify(analysis.counts,null,2));
