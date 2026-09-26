// An opt-in, deterministic class simulation. These notes never enter the
// public Google Form or Sheet; remove ?simulateNotes=200 to return to live notes.
export function annotationSimulationRequest(search = window.location.search) {
  const params = new URLSearchParams(search);
  const count = Number(params.get("simulateNotes"));
  return Number.isInteger(count) && count > 0 && count <= 500 && params.get("map")
    ? { mapId: params.get("map"), count }
    : null;
}

function seededRandom(seed) {
  let state = seed >>> 0;
  return () => {
    state = (state + 0x6D2B79F5) >>> 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

export function simulatedAnnotations(map, count = 60) {
  const seed = [...map.id].reduce((value, character) => Math.imul(value ^ character.charCodeAt(0), 16777619), 2166136261);
  const random = seededRandom(seed);
  const [west, south, east, north] = map.bbox;
  const marginX = (east - west) * .07;
  const marginY = (north - south) * .07;
  const aliases = ["Mina", "Leo", "Asha", "Ren", "Sofia", "Jun", "Nadia", "Eli", "Hana", "Mateo", "Iris", "Omar", "Clara", "Theo", "Amira", "Kai", "Lena", "Ravi", "Noor", "Emil"];
  const shuffledAliases = [...aliases];
  for (let index = shuffledAliases.length - 1; index > 0; index -= 1) {
    const other = Math.floor(random() * (index + 1));
    [shuffledAliases[index], shuffledAliases[other]] = [shuffledAliases[other], shuffledAliases[index]];
  }
  const observations = [
    "The border looks firmer here than I expected.",
    "I keep comparing this edge with the present coastline.",
    "The open space feels just as important as the place names.",
    "This label is clear, but the area around it is hard to read.",
    "The map makes distance feel different from the basemap.",
    "I wonder what has been left outside this frame.",
    "The line seems to join places that feel far apart now.",
    "The colors make this region feel divided into pieces.",
    "I noticed how quickly the map changes when I move across it.",
    "This point looks ordinary until I compare it with the older layer.",
    "The printed boundary does not feel like a natural edge.",
    "Some names stand out; others seem almost hidden.",
    "I am not sure where the map stops describing and starts proposing.",
    "The scale makes this place feel connected to a much larger space.",
    "I followed the road and lost track of where the border was.",
    "The texture of the old map changes how I read the terrain.",
    "There is a small detail here I would have missed at first.",
    "The map's center feels less important than its edges.",
    "I can see more than one version of this place at once.",
    "The old route gives this landscape a different direction."
  ];
  const reflections = [
    "I wonder whose route this map takes for granted.",
    "The mismatch makes the overlay more interesting to me.",
    "I would like to compare this with a neighboring layer.",
    "It feels like a choice, not just a measurement.",
    "I am not sure what the map cannot show here.",
    "This detail is easy to miss until I slow down.",
    "Maybe the blank area is part of the story.",
    "I want to see how this changes at another scale.",
    "The old surface makes this place feel less settled.",
    "It would look different from the other side."
  ];
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(3, "0");
    return {
      id: `class-simulation-${map.id.replace(/[^a-zA-Z0-9]/g, "-")}-${number}`,
      simulated: true,
      simulationCount: count,
      timestamp: new Date(Date.UTC(2026, 8, 27, 0, index)).toISOString(),
      timestampValue: Date.UTC(2026, 8, 27, 0, index),
      text: `${observations[index % observations.length]} ${reflections[Math.floor(index / observations.length) % reflections.length]}`,
      name: shuffledAliases[index % shuffledAliases.length],
      tag: "class simulation",
      tags: ["class simulation"],
      context: {
        mapId: map.id, title: map.title, city: map.city, year: map.year,
        point: { lng: west + marginX + random() * (east - west - 2 * marginX), lat: south + marginY + random() * (north - south - 2 * marginY) },
        core: null, camera: null
      }
    };
  });
}
