// Dizko ID launch film: every caption, sample row and timing lives here.
//
// Everything below is SAMPLE DATA for a product animation. The artist, events,
// mix, tracks and counts are fictional; nothing is identified live, no store is
// called and no cart is touched.
//
// Edit, then re-render:  npm run render
// (`npm run sync` rewrites the film length in index.html from `end.at + end.hold`.)

window.DIZKO_DEMO = {
  // On-screen captions. `at` / `until` are seconds into the film; `accent` is the
  // one word drawn in Dizko acid; "\n" breaks the line; `place: "side"` sits it in the empty space left
  // of the panel instead of the bottom edge.
  captions: [
    { text: "find tracks in a mix", accent: "tracks", at: 0.6, until: 7.6 },
    { text: "preview the matches", accent: "preview", at: 8.0, until: 11.5, place: "side" },
    { text: "add selected tracks\nto your cart", accent: "cart", at: 11.8, until: 17.6, place: "side" },
  ],

  // Shown for the whole film, and again on the end card.
  disclaimer: "Sample data. Not a live identification.",

  // The mix page behind the extension (an unbranded SoundCloud-style page).
  mix: {
    url: "soundcloud.com/demo-selector/sample-mix-014",
    uploader: "Demo Selector",
    title: "Sample Mix 014 at Demo Festival",
    length: "1:58:20",
    lengthSeconds: 7100,
    startAt: 3020, // where the mix is when the film opens, in seconds
    genre: "House",
  },

  // Dizko ID side panel: the artist block (from Dizko's event data).
  artist: {
    name: "Demo Selector",
    meta: "House, Electro · Berlin, Lisbon",
    dates: [
      { date: "Fri, Nov 13", title: "SAMPLE NIGHT 014", where: "Berlin, Sample Club" },
      { date: "Sat, Nov 21", title: "Demo Festival Closing Party", where: "Lisbon, Sample Warehouse" },
    ],
    moreDates: 4,
  },

  // The listening state, as the panel shows it while Shazam works.
  listening: { label: "Waiting for Shazam", percent: [41, 42, 43] },

  // Confirmed tracks (heard in 2+ clips) start ticked; unconfirmed start unticked.
  // `at` is the position in the mix.
  tracks: [
    { at: "6:00", artist: "Kessler Vale", title: "Night Ferry", confident: true },
    { at: "21:30", artist: "Oro Lune", title: "Salt Lines (Dub Mix)", confident: true },
    { at: "44:00", artist: "Juno Faraday", title: "Ninth Street", confident: true },
    { at: "12:00", artist: "Teo Banerji", title: "Pressure Glass", confident: false },
    { at: "33:00", artist: "Pale Kites", title: "Tilt (Ravel Rework)", confident: false },
  ],
  // Identified while we watch: arrives as unconfirmed (heard once).
  arriving: { at: "49:30", artist: "Marla Quist", title: "Undertow", confident: false },

  storeLinks: ["Beatport", "Bandcamp", "Spotify", "YouTube"],

  // What the cursor does. Indexes count from 0 within each group.
  previewTrack: 2, // confirmed track whose play button is pressed
  tickUnconfirmed: 0, // unconfirmed track the cursor ticks
  addTo: "Beatport", // which add button is pressed

  // Scene timings, in seconds.
  timing: {
    cursorToExtension: 1.6, // cursor heads for the toolbar icon
    openPanel: 2.5, // click; the side panel slides in
    toPanel: 3.3, // camera pushes onto the panel
    toList: 5.8, // panel scrolls to the tracklist
    trackArrives: 7.0,
    preview: 8.3, // cursor heads for the play button (click ~0.8 s later)
    tick: 12.0, // cursor heads for the checkbox
    toButtons: 13.4, // panel scrolls back to the add buttons
    addClick: 15.6,
  },
  end: { at: 17.8, hold: 4.8, cta: "github.com/Dizko-Labs/dizko-id" },
};
