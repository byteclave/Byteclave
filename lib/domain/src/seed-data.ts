import type {
  CategoryInput,
  CollectionInput,
  DiscoveryInput,
  TagInput,
} from "./schemas/catalog";

export interface SeedCategory extends CategoryInput {
  subcategories: Array<{
    slug: string;
    name: string;
    description?: string;
    sortOrder?: number;
  }>;
}

export interface SeedDiscovery extends DiscoveryInput {
  tags: string[];
  publish?: boolean;
  placements: Array<{
    categorySlug: string;
    subcategorySlug?: string;
    sortOrder?: number;
  }>;
}

export interface SeedCollection extends CollectionInput {
  discoveries: string[];
}

export interface CatalogSeed {
  categories: SeedCategory[];
  discoveries: SeedDiscovery[];
  tags: TagInput[];
  collections: SeedCollection[];
}

export const catalogSeed: CatalogSeed = {
  categories: [
    {
      slug: "developer-tools",
      name: "Developer tools",
      description: "Tools for building, testing, and maintaining software.",
      sortOrder: 10,
      subcategories: [
        { slug: "code-hosting", name: "Code hosting", sortOrder: 10 },
      ],
    },
    {
      slug: "creative-tools",
      name: "Creative tools",
      description: "Open tools for visual thinking and creative work.",
      sortOrder: 20,
      subcategories: [
        { slug: "diagramming", name: "Diagramming", sortOrder: 10 },
      ],
    },
    {
      slug: "knowledge-work",
      name: "Knowledge work",
      description: "Tools for collecting, connecting, and using knowledge.",
      sortOrder: 30,
      subcategories: [
        { slug: "notes-research", name: "Notes and research", sortOrder: 10 },
      ],
    },
    {
      slug: "productivity",
      name: "Productivity",
      description: "Everyday tools for focused work.",
      sortOrder: 40,
      subcategories: [
        { slug: "office-suites", name: "Office suites", sortOrder: 10 },
        { slug: "planning", name: "Planning", sortOrder: 20 },
      ],
    },
    {
      slug: "utilities",
      name: "Utilities",
      description: "Useful tools that do not need a deeper category tree.",
      sortOrder: 50,
      subcategories: [],
    },
  ],
  tags: [
    { slug: "open-source", name: "Open source" },
    { slug: "self-hostable", name: "Self-hostable" },
    { slug: "cross-platform", name: "Cross-platform" },
    { slug: "web-app", name: "Web app" },
  ],
  discoveries: [
    {
      slug: "github",
      title: "GitHub",
      summary: "A platform for hosting and collaborating on software projects.",
      url: "https://github.com/",
      publish: true,
      tags: ["web-app"],
      placements: [{ categorySlug: "developer-tools", subcategorySlug: "code-hosting" }],
    },
    {
      slug: "excalidraw",
      title: "Excalidraw",
      summary: "A browser-based whiteboard for hand-drawn diagrams.",
      url: "https://excalidraw.com/",
      publish: true,
      tags: ["open-source", "web-app"],
      placements: [{ categorySlug: "creative-tools", subcategorySlug: "diagramming" }],
    },
    {
      slug: "obsidian",
      title: "Obsidian",
      summary: "A local-first knowledge base built from linked notes.",
      url: "https://obsidian.md/",
      publish: true,
      tags: ["cross-platform"],
      placements: [
        { categorySlug: "knowledge-work", subcategorySlug: "notes-research" },
        { categorySlug: "productivity", subcategorySlug: "planning" },
      ],
    },
    {
      slug: "libreoffice",
      title: "LibreOffice",
      summary: "A free, open-source office productivity suite.",
      url: "https://www.libreoffice.org/",
      publish: true,
      tags: ["open-source", "cross-platform"],
      placements: [{ categorySlug: "productivity", subcategorySlug: "office-suites" }],
    },
    {
      slug: "firefox",
      title: "Firefox",
      summary: "An independent web browser from Mozilla.",
      url: "https://www.mozilla.org/firefox/",
      publish: true,
      tags: ["open-source", "cross-platform"],
      placements: [{ categorySlug: "utilities" }],
    },
  ],
  collections: [
    {
      slug: "open-tools-for-making",
      name: "Open tools for making",
      description: "Open-source resources for building and sharing creative work.",
      discoveries: ["excalidraw", "github"],
    },
    {
      slug: "focused-knowledge-work",
      name: "Focused knowledge work",
      description: "A small set of tools for notes, research, and everyday work.",
      discoveries: ["obsidian", "libreoffice"],
    },
  ],
};
