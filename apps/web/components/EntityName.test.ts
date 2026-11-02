import { createElement, Fragment } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import EntityName, { linkNames } from "./EntityName";

const html = (node: ReturnType<typeof linkNames>) => renderToStaticMarkup(createElement(Fragment, null, node));

describe("an entity's name", () => {
  it("links its page in the same tab, as the party asked for; without an id it is text", () => {
    expect(renderToStaticMarkup(createElement(EntityName, { id: "2146547", role: "authority", children: "SPITALUL MUNICIPAL GHERLA" })))
      .toBe('<a class="entity-name" href="/entitati/2146547?rol=autoritate">SPITALUL MUNICIPAL GHERLA</a>');
    expect(renderToStaticMarkup(createElement(EntityName, { id: null, children: "Furnizor neprecizat" }))).toBe("<span>Furnizor neprecizat</span>");
  });

  it("links the names a sentence mentions, the longest first, and leaves the rest of the words", () => {
    expect(html(linkNames("A cumpărat SPITALUL MUNICIPAL GHERLA de la ARLEVERT CONSTRUCT până acum?", [
      { id: 2146547, name: "SPITALUL MUNICIPAL GHERLA", role: "authority" }, { id: 1976779, name: "ARLEVERT CONSTRUCT", role: "supplier" },
    ]))).toBe('A cumpărat <a class="entity-name" href="/entitati/2146547?rol=autoritate">SPITALUL MUNICIPAL GHERLA</a> de la '
      + '<a class="entity-name" href="/entitati/1976779?rol=furnizor">ARLEVERT CONSTRUCT</a> până acum?');
    expect(html(linkNames("Compară ROMSILVA cu ROMSILVA SUCURSALA", [{ id: 1, name: "ROMSILVA" }, { id: 2, name: "ROMSILVA SUCURSALA" }])))
      .toBe('Compară <a class="entity-name" href="/entitati/1">ROMSILVA</a> cu <a class="entity-name" href="/entitati/2">ROMSILVA SUCURSALA</a>');
    expect(linkNames("Ce firme câștigă în Cluj?", [{ id: 1, name: "SYSTRA" }])).toBe("Ce firme câștigă în Cluj?");
  });
});
