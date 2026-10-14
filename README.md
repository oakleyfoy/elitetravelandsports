# Elite Travel and Sports Tours USA

A premium static landing page for a USA-facing sister brand focused on guided international tennis travel worldwide.

## Files

- `index.html` - Page structure and marketing content.
- `styles.css` - Visual design, responsive layout, and brand styling.
- `script.js` - Mobile navigation, sticky header state, and dynamic footer year.

## Run Locally

Open `index.html` in a browser, or serve the folder with any static server.

```bash
python -m http.server 8000
```

Then visit `http://localhost:8000`.

## Past Experiences

`/past-experiences/` and each trip page are rendered by `server.js` from `data/past-experiences.json`, using the
templates `past-experiences/index.html` and `past-experiences/_trip.html`. Run the site with `npm start` (not a
static server) to see them.

To add a completed trip:

1. Put compressed photos (about 2000px wide, under 500 KB each) in `assets/past-experiences/<slug>/`.
2. Upload videos to YouTube or Vimeo. Never commit video files.
3. Add an entry to the `trips` list in `data/past-experiences.json`:

```json
{
  "slug": "example-trip-2027",
  "title": "Trip title",
  "destination": "City, Country",
  "startDate": "2027-05-12",
  "endDate": "2027-05-19",
  "summary": "One or two sentences used on the page and in search results.",
  "coverImage": { "src": "/assets/past-experiences/example-trip-2027/cover.jpg", "alt": "Describe the photo" },
  "description": ["Paragraph one.", "Paragraph two."],
  "highlights": ["Highlight one", "Highlight two"],
  "gallery": [
    {
      "src": "/assets/past-experiences/example-trip-2027/01.jpg",
      "thumbnail": "/assets/past-experiences/example-trip-2027/thumbs/01.jpg",
      "alt": "Describe the photo",
      "caption": "Optional"
    }
  ],
  "videos": [{ "url": "https://www.youtube.com/watch?v=VIDEO_ID", "title": "Describe the video" }]
}
```

`slug`, `title`, `destination`, `summary`, both dates, and a cover image with `alt` text are required; a trip missing
any of them is skipped and the reason is logged. `description`, `highlights`, `gallery`, and `videos` are optional, and
empty sections are left off the page. An image's `thumbnail` (a smaller copy shown on the page; the full image opens
in the viewer) and `caption` are optional. Video `url` accepts YouTube links and Vimeo links, including unlisted Vimeo links.
Trip pages are added to `/sitemap.xml` automatically.

`npm run preview:sample` also loads labeled placeholder trips from `data/past-experiences.sample.json`, a local-only
file that is git-ignored and never committed. Placeholder trips never load on Render.

## Customize

- Replace `info@elitetravelsportsusa.com` in `index.html` with the final inquiry email.
- Update destinations, sample routes, and partner language once the Morocco group provides more details.
- Add photography when available. The current build uses premium color, typography, and court-inspired graphic treatments so it works before final assets are ready.
