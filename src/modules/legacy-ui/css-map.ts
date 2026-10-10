// CSS original: cada archivo se carga solo cuando se abre su módulo.
export const pageCssFiles: Record<string, string[]> = {
  "home": [
    "home"
  ],
  "map": [
    "map",
    "map-filters"
  ],
  "nation": [
    "nation"
  ],
  "region": [
    "region"
  ],
  "territory": [
    "territory"
  ],
  "party": [
    "party"
  ],
  "coalition": [
    "party",
    "coalition"
  ],
  "nationalparliament": [
    "nationalparliament"
  ],
  "regionalparliament": [
    "regionalparliament"
  ],
  "election": [
    "election"
  ],
  "news": [
    "news"
  ],
  "work": [
    "work"
  ],
  "storage": [
    "storage"
  ],
  "wars": [
    "war"
  ],
  "war": [
    "war"
  ],
  "market": [],
  "messages": [],
  "shop": [],
  "config": []
} as Record<string,string[]>;
