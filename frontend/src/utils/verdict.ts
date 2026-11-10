import type { AlgorithmResult } from "../types";

/** The one verdict the UI shows: the true-key check when known, else the attack's own statistical verdict. */
export const isCracked = (r: AlgorithmResult): boolean => r.correct ?? r.success;
