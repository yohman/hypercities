# Origins: the moving archive

Catalogue of all 49 public entries on the [HyperCities channel Videos page](https://www.youtube.com/@hypercitiesproject/videos), reviewed 26 September 2026. Original titles, IDs, ordering, and displayed durations come from the rendered channel listing. Durations are approximate where YouTube rounds to whole minutes. Variants and technical recordings are retained, not silently merged.

## Evidence and editorial metadata

Records are in `data/origins-videos.json`. Each retains its source URL, original title, duration label, normalized duration, upload year and evidence, nullable recording date, place, topics, and optional historical subject period/description.

- The channel in Latest order contains 43 uploads in its later group and six earlier uploads. The later group's endpoints—[Tale of Two Castles Test v2](https://www.youtube.com/watch?v=Krwl3ZtMZHk) and [Ritual Experience - Inscriptions](https://www.youtube.com/watch?v=p2yaTlMAa7A)—both show 2 November 2016. The earlier group's endpoints—[Harmony House](https://www.youtube.com/watch?v=xbVTDpi0G8Q) and [101](https://www.youtube.com/watch?v=d9hO2uakwAs)—both show 7 July 2010. Intervening upload years are inferred from that chronological ordering, not individually date-verified.
- Upload years are NOT recording dates or the years depicted. Recording dates remain null.
- Places and topic tags are editorial browsing aids based on titles and recognizable collections. Unverified locations are left blank; testimony is not arbitrarily assigned to an entire continent.
- [Teran HyperCities](https://www.youtube.com/watch?v=U3jJLUXs6_k) describes day-by-day mapping of the 2009 election protests. Tehran normalizes the title's spelling; the historical year and protest topic come from the description. YouTube labels it age-restricted.
- [Ritual Experience - Inscriptions](https://www.youtube.com/watch?v=p2yaTlMAa7A) describes Gregor Kalas and PI Diane Favro's visualization of statues and inscriptions in the late antique Roman Forum. Rome and Late antiquity are source-supported.
- The broad Holocaust/remembrance subject tag groups the survivor collection and named shorter edits; precise biographical dates and itinerary locations have not been extracted.
- Related-video suggestions share a verified/editorially assigned place or topic and favor unvisited records. The visible label explains that match. These connections are not added to the Hyperbook's scholarly graph.

## Navigation and playback

Search and Place/Topic/Time filters combine. The time menu separates depicted periods from upload years. No result is invented for an empty intersection. Previous/Next and Left/Right follow the current filtered list, not a hidden six-video cycle. Selecting a film outside those results via a related link is explicitly indicated. On small screens, Browse folds after selection; it remains reachable to change direction.

The standard YouTube iframe is inserted immediately when Play is requested. Referrer policy and permissions are set before its URL loads. The optional [IFrame API](https://developers.google.com/youtube/iframe_api_reference) monitors readiness and errors but never gates the ordinary iframe or masks it with a timeout overlay. A delayed readiness signal displays a small hint BELOW the player, not an assertion that the film is unavailable. Actual API errors display their reason/code. Reload and Watch on YouTube remain available.

Some videos require viewing on YouTube due to age/owner restrictions; some browser environments block third-party playback. No attempt is made to bypass either. Use HTTP localhost for preview, not file:// (which cannot provide a normal referring origin). Films are not downloaded or rehosted. Closing or selecting another film destroys/removes the iframe and stops its sound.

## Maintenance

This is a static snapshot, not a live YouTube API feed. To extend it, verify a channel record, add it to the JSON, and keep unknown metadata empty. The interface computes options and counts from the data. Search/filter state and visited dots last for the current site session. The existing map, TimeWell, and Hyperbook are unchanged.
