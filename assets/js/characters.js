// Character (mascot) catalog — add entries here; the picker scales to large lists.
// `images` maps timer phase -> image. Missing phases fall back to `image`.
// Only Tomo has mood variants today; Pro characters use a single image for every phase.
window.TOMOFLOW_CHARACTERS = [
  {
    id: "tomo",
    name: "Tomo",
    free: true,
    category: "Classic",
    image: "/assets/img/tomatoes/tomato-happy.png",
    images: {
      work: "/assets/img/tomatoes/tomato-happy.png",
      break: "/assets/img/tomatoes/tomato-withered.png",
      long: "/assets/img/tomatoes/tomato-withered.png",
    },
  },
  { id: "blueberry", name: "Bloo", free: false, category: "Cozy", image: "/assets/img/characters/blueberry.png" },
  { id: "lemon", name: "Zest", free: false, category: "Study", image: "/assets/img/characters/lemon.png" },
  { id: "avocado", name: "Avo", free: false, category: "Chill", image: "/assets/img/characters/avocado.png" },
  { id: "moon", name: "Luna", free: false, category: "Night", image: "/assets/img/characters/moon.png" },
  { id: "chili", name: "Chili", free: false, category: "Hype", image: "/assets/img/characters/chili.png" },
];
