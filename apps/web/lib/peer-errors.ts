import { ConnectionError } from "./connections";

export class PeerError extends ConnectionError {
  constructor(message: string, status = 400) { super(message, status); this.name = "PeerError"; }
}
