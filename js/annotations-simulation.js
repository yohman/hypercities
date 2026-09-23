// An opt-in, deterministic density study. These notes never enter the public
// Google Form or Sheet; remove ?simulateNotes=60 to return to live annotations.
export function annotationSimulationRequest(search = window.location.search) {
  const params = new URLSearchParams(search);
  return params.get("simulateNotes") === "60" && params.get("map")
    ? { mapId: params.get("map"), count: 60 }
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
  return Array.from({ length: count }, (_, index) => {
    const number = String(index + 1).padStart(2, "0");
    return {
      id: `simulation-${map.id.replace(/[^a-zA-Z0-9]/g, "-")}-${number}`,
      simulated: true,
      timestamp: new Date(Date.UTC(2026, 8, 23, 0, index)).toISOString(),
      timestampValue: Date.UTC(2026, 8, 23, 0, index),
      text: `Simulated note ${number} of ${count}. A temporary point for testing how many annotations this historical map can hold.`,
      tag: "simulation",
      context: {
        mapId: map.id, title: map.title, city: map.city, year: map.year,
        point: { lng: west + marginX + random() * (east - west - 2 * marginX), lat: south + marginY + random() * (north - south - 2 * marginY) },
        core: null, camera: null
      }
    };
  });
}
