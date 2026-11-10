export interface TeamMember {
  name: string;
  photo: string; // 256 px square disc
  card: string; // 480x600 portrait for the opened team cards
  faceX: number; // face centre on the portrait (0..1); the disc is cropped around this point, so the morph starts there
  faceY: number;
}

const base = import.meta.env.BASE_URL;

// Studio portraits (2026-11-04): background-removed photos on colour backdrops with matched light
// (scratchpad nobg-scripts/polish.py). Card 480x600; disc = a square of 52% of the card width around the face.
export const TEAM: TeamMember[] = [
  { name: "Mihai Cataraga", photo: `${base}team/mihai_cataraga.jpg`, card: `${base}team/card/mihai_cataraga.jpg`, faceX: 0.479, faceY: 0.358 },
  { name: "Ion Jora", photo: `${base}team/ion_jora.jpg`, card: `${base}team/card/ion_jora.jpg`, faceX: 0.375, faceY: 0.45 },
  { name: "Mihai Dobrioglo", photo: `${base}team/mihai_dobrioglo.jpg`, card: `${base}team/card/mihai_dobrioglo.jpg`, faceX: 0.495, faceY: 0.354 },
];
