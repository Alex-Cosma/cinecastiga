import { DomainsGhost } from "./DomainExplorer";

/** The atlas takes seconds to prepare on a cold year (prod 4–20 s): the ghost of the loaded page meanwhile. */
export default function DomainsLoading() {
  return <DomainsGhost />;
}
