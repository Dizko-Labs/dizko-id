// Dizko ID launch film: every caption, data row and timing lives here.
//
// The mix, artist, dates and track rows are real (Maara @ The Lot Radio, the
// artist's appearances from Dizko, two rows from the extension's own panel).
// Shazam listening is shown sped up. The SoundCloud page is a screenshot kept in
// assets/private/ (git-ignored: the photo belongs to The Lot Radio).
//
// Edit, then re-render:  npm run render
// (`npm run sync` rewrites the film length in index.html from `end.at + end.hold`.)

window.DIZKO_DEMO = {
  // On-screen captions. `at` / `until` are seconds into the film; `accent` is the
  // one word drawn in Dizko acid; "\n" breaks the line; `place: "side"` sits it in
  // the space left of the panel instead of the bottom edge.
  captions: [
    { text: "find tracks in a mix", accent: "tracks", at: 0.6, until: 8.4 },
    { text: "see where\nthey play next", accent: "play", at: 9.2, until: 12.4, place: "side" },
    { text: "preview\nthe matches", accent: "preview", at: 12.8, until: 15.4, place: "side" },
    { text: "add selected tracks\nto your cart", accent: "cart", at: 15.6, until: 20.8, place: "side" },
    { text: "keep every find\nin your library", accent: "library", at: 21.2, until: 23.9, place: "side" },
    { text: "and every DJ's\nnext dates", accent: "dates", at: 24.2, until: 27.2, place: "side" },
  ],

  // Shown for the whole film, and again on the end card.
  disclaimer: "Shazam listening sped up for this video.",

  page: {
    url: "soundcloud.com/thelotradio/maara-the-lot-radio-06-28-2026",
    image: "assets/private/soundcloud-page.png", // 1342 x 830 screenshot crop
    button: "assets/private/dizko-button.png", // the in-page Dizko ID button
    buttonBox: { x: 659, y: 479, w: 129, h: 56 }, // its place in the screenshot, px
  },

  // Dizko's artist block (real data from Dizko; `dizko: true` dates link to a
  // Dizko event page and are underlined, as in the extension).
  artist: {
    name: "Maara",
    meta: "Techno, House, Trance · Berlin, Amsterdam, Montreal",
    dates: [
      { date: "Fri, Oct 30", title: "A week-end with Jen Cardini", where: "Lyon, Le Sucre" },
      { date: "Sat, Oct 31", title: "Cuddles Halloween", where: "Berlin, ÆDEN", dizko: true },
      { date: "Thu, Nov 5", title: "Isulia Festival 2026", where: "Bordeaux, Base Sous-Marine de Bordeaux" },
      { date: "Fri, Nov 20", title: "RSO: YEAR FIVE w/ Function, Stef Mendesidis, Tasha b2b Deetron", where: "Berlin, RSO.BERLIN", dizko: true },
      { date: "Fri, Nov 20", title: "common room presents: Maara - Ultra Villain [live]", where: "London, Ormside Projects", dizko: true },
    ],
    shownDates: 3, // the rest sit behind "N more dates"
  },

  mix: { title: "Maara @ The Lot Radio 06-28-2026" },

  // Listening: "Waiting for Shazam" fills to 100%, then the block folds away.
  listening: { label: "Waiting for Shazam" },
  ticked: 5,
  total: 16,

  // The two rows shown, as the panel shows them. `atPercent` is when each one
  // lands during the sped-up listen.
  tracks: [
    {
      at: "9:20", artist: "666", title: "Amokk (X-Tended Mix)", atPercent: 22,
      afterBeatport: { status: "Version not on Beatport", available: ["X-Tended 666 Mix", "X-tended 666 Mix", "Xtended 666 Mix", "Video Version"] },
      bandcampHighlight: true, // green title: in your Bandcamp cart
    },
    { at: "16:30", artist: "WOST", title: "Primal Motion", atPercent: 38, afterBeatport: { status: "In cart" } },
  ],
  storeLinks: ["Beatport", "Bandcamp", "Spotify", "YouTube"],
  bandcampAfter: 3, // "Add 3 to Bandcamp" once Beatport has its tracks

  // Library. Tracks: this mix's rows first, then rows already in the library
  // (from the Waking Life mix, as in the extension's Library screenshot).
  // Artists: the DJs whose mixes are in the library, with their next dates
  // from Dizko. The Artists tab layout reuses the panel's artist block.
  library: {
    mixes: 2,
    tracks: 11,
    earlierTracks: {
      mix: "Waking Life 2025 Saturday sunrise at Floresta",
      rows: [
        { artist: "LA Synthesis", title: "Reich (Original Mix)" },
        { artist: "Tentakel", title: "Impulse" },
        { artist: "P.W.O.G.", title: "Maenad (Alter Ego Remix)" },
        { artist: "D.I.N.", title: "Fantastic Planet" },
        { artist: "Odessi", title: "Beautiful Malika (King of Spin Dub)" },
      ],
    },
    artists: [
      {
        name: "Maara", meta: "Techno, House, Trance · Berlin, Amsterdam, Montreal", more: 3,
        dates: [
          { date: "Fri, Oct 30", title: "A week-end with Jen Cardini", where: "Lyon, Le Sucre" },
          { date: "Sat, Oct 31", title: "Cuddles Halloween", where: "Berlin, ÆDEN", dizko: true },
        ],
      },
      {
        name: "Jane Fitz", meta: "Techno, House, Electro · London, Berlin, Amsterdam", more: 10,
        dates: [
          { date: "Fri, Oct 30", title: "SOUND METAPHORS FESTIVAL PART 2", where: "Berlin, Berghain | Panorama Bar | Säule", dizko: true },
          { date: "Sat, Oct 31", title: "Anarchyintheclub: Halloween with Jane Fitz, Brasi, Carlo Amadori", where: "Rome, Borgo Della Mistica" },
        ],
      },
    ],
  },

  previewTrack: 0, // which row's play button is pressed

  // Scene timings, in seconds.
  timing: {
    cursorToButton: 1.3, // cursor heads for the in-page Dizko ID button
    openPanel: 2.4, // click; Chrome's side panel slides in
    toPanel: 3.0,
    listenStart: 3.6,
    listenEnd: 8.2,
    toDates: 9.0,
    moreDates: 10.3, // click "2 more dates"
    toRows: 12.5,
    preview: 13.7, // click play
    addBeatport: 16.6, // click "Add 5 to Beatport"
    addBandcamp: 19.3, // click "Add 3 to Bandcamp"
    toLibrary: 20.9, // camera returns to the top
    libraryClick: 21.9, // click "< Library" (opens on Tracks)
    artistsTab: 24.2, // click the Artists tab
  },
  end: { at: 27.4, hold: 2.6, cta: "Dizko ID for Chrome" },
};
