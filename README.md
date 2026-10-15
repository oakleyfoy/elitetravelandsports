# Elite Travel and Sports Tours USA

A premium landing page for a USA-facing sister brand focused on guided international tennis travel worldwide.

## Files

- `index.html` - Page structure and marketing content.
- `styles.css` - Visual design, responsive layout, and brand styling.
- `script.js` - Mobile navigation, sticky header state, and dynamic footer year.
- `server.js` - Serves the site, renders trip pages, and handles the inquiry API.
- `data/trips.json` - Every departure, upcoming and past.

## Run Locally

```bash
npm start
```

Then visit `http://localhost:10000`. Use the Node server rather than a static file server: the homepage,
`/destinations/international/`, `/destinations/morocco/`, and `/past-experiences/` are rendered from trip data and
contain `{{TOKENS}}` when opened as plain files.

Run `npm test` after editing trips. It checks `data/trips.json` and the date rules.

## Trips

Each trip is entered once in `data/trips.json`. The server decides where it appears on every page load, using the
current date in the trip's own `timeZone`:

- Before its `startDate`, the trip is **open for booking**: it appears in the homepage departure list, the homepage
  featured rotation (if it has `featured`), the Worldwide Experiences page, the search descriptions, the homepage
  footer destination line, and, for Morocco trips, the Morocco page and its form dropdown.
- From its `startDate` through its `endDate`, it stays listed with its dates, price, and itinerary, labeled
  "Departure in progress". It leaves the featured rotation, the search descriptions, the footer destination line, and
  the Morocco form dropdown.
- From the day after its `endDate`, it is **past**: it disappears from all of those and appears on Past Experiences
  with its title, dates, destination, and cover. Past pages never show a price, PDF, or booking prompt.
- A trip with `"status": "cancelled"` appears nowhere.

When nothing is open for booking, the homepage and Worldwide Experiences page show "New experiences are on the
horizon. Explore our past journeys or contact us to plan your next adventure." The Morocco page shows "There are
currently no scheduled Morocco departures. Contact our team to explore future opportunities." and its form offers
"Future Morocco departures".

No commit or redeploy is needed for a trip to move. Pages are sent with `Cache-Control: no-cache` so browsers pick up
the change the same day.

### Trip fields

```json
{
  "slug": "spain-marbella-2027",
  "title": "Marbella Spain & Tennis Experience",
  "country": "Spain",
  "destination": "Marbella, Spain",
  "timeZone": "Europe/Madrid",
  "startDate": "2027-01-27",
  "endDate": "2027-02-03",
  "price": "$6,800 USD per person",
  "summary": "Shown on the upcoming card, and on the past page when the trip has an itinerary.",
  "printableItinerary": "/destinations/Marbella%20Spain%20%26%20Tennis%20Experience.pdf",
  "anchor": "international-trip-spain",
  "anchorTarget": "itinerary",
  "homeImage": "/assets/editorial/example.jpg",
  "featured": {
    "kicker": "Spain",
    "title": "A Marbella departure",
    "summary": "Featured panel text; the dates and price are added automatically",
    "image": "/assets/destinations/example.jpg"
  }
}
```

- Required: `slug`, `title`, `country`, `destination`, `timeZone` (an IANA name such as `Europe/Rome`), `startDate`,
  `endDate`, and `summary`. Dates are always `YYYY-MM-DD`. If any trip has a missing or invalid field, the trip pages
  return a "temporarily unavailable" error page instead of an incomplete schedule, the server log lists every
  problem, and `npm test` fails. Run `npm test` before publishing trip edits.
- `price`: leave it out while details are pending; the trip shows "More info coming soon" instead.
- `status`: `"scheduled"` (default) or `"cancelled"`.
- `printableItinerary`: PDF link on upcoming cards only.
- `anchor`: the id used by links such as `/destinations/international/#international-trip-spain`. `anchorTarget`
  `"itinerary"` puts it on the itinerary so the link opens it; the default `"card"` scrolls to the card.
- `moroccoPageAnchor`: the itinerary id on the Morocco page (Morocco trips only).
- `homeImage`: background for the homepage departure card. `featured`: include it to add the trip to the homepage
  featured rotation, which shows one upcoming featured trip per day.
- `pastSummary`: replaces `summary` on the Past Experiences page.

The day-by-day itinerary lives in `data/itineraries/<slug>.html` as `<section>` blocks. It is shown on upcoming cards
and on the past trip page. Leave prices and links out of it.

### Adding photos and videos after a trip

Media can be added at any time; it never changes when a trip moves. Until a trip has a `coverImage`, it uses a
branded "Photos coming soon" cover, and until it has a `gallery` or `videos`, its page shows "Photos and videos
coming soon".

1. Put compressed photos (about 2000px wide, under 500 KB each) in `assets/past-experiences/<slug>/`, with smaller
   copies in `thumbs/`.
2. Upload videos to YouTube or Vimeo (unlisted is fine). Never commit video files.
3. Add these fields to the trip in `data/trips.json`:

```json
"coverImage": {
  "src": "/assets/past-experiences/example-trip-2027/cover.jpg",
  "thumbnail": "/assets/past-experiences/example-trip-2027/thumbs/cover.jpg",
  "alt": "Describe the photo"
},
"gallery": [
  {
    "src": "/assets/past-experiences/example-trip-2027/01.jpg",
    "thumbnail": "/assets/past-experiences/example-trip-2027/thumbs/01.jpg",
    "alt": "Describe the photo",
    "caption": "Optional"
  }
],
"videos": [{ "url": "https://www.youtube.com/watch?v=VIDEO_ID", "title": "Describe the video" }],
"description": ["Optional paragraph."],
"highlights": ["Optional highlight"]
```

Images need `alt` text; `thumbnail` and `caption` are optional. Video `url` accepts YouTube and Vimeo links, including
unlisted Vimeo links. Past trip pages are added to `/sitemap.xml` automatically.

### Previewing other dates

`ELITE_TODAY=2027-02-04 npm start` shows the site as it will look on that date in every time zone. Render ignores
`ELITE_TODAY`.

`npm run preview:sample` also loads labeled placeholder trips from `data/past-experiences.sample.json`, a local-only
file that is git-ignored and never committed. Placeholder trips never load on Render.

## Customize

- Replace `info@elitetravelsportsusa.com` in `index.html` with the final inquiry email.
- Update destinations, sample routes, and partner language once the Morocco group provides more details.
- Add photography when available. The current build uses premium color, typography, and court-inspired graphic treatments so it works before final assets are ready.
