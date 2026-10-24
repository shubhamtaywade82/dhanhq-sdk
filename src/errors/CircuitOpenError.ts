import { DhanError } from "./DhanError";

export class CircuitOpenError extends DhanError {
  constructor(
    message = "Circuit breaker open: too many recent failures",
    cause?: unknown,
  ) {
    super(message, {
      code: "CIRCUIT_OPEN",
      cause,
    });
    this.name = "CircuitOpenError";
  }
}
