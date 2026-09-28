export function normalizeRecipeTitle(title: string): string {
  return title.replace(/\s+/gu, " ").trim();
}

export function copyRecipeTitle(title: string, number = 1): string {
  let base = normalizeRecipeTitle(title).replace(/ — copie(?: \d+)?$/iu, "");
  const suffix = number === 1 ? " — copie" : ` — copie ${number}`;
  while (base.length + suffix.length > 160) base = Array.from(base).slice(0, -1).join("");
  return base.trimEnd() + suffix;
}
