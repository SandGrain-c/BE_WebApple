export class ShipmentServiceError extends Error {
  readonly statusCode: number;

  constructor(message: string, statusCode: number) {
    super(message);
    this.statusCode = statusCode;
  }
}

export class CustomerShipmentAccessError extends ShipmentServiceError {}

export const shipmentValidationError = (message: string) =>
  new ShipmentServiceError(message, 400);

export const shipmentNotFoundError = (message: string) =>
  new ShipmentServiceError(message, 404);

export const shipmentConflictError = (message: string) =>
  new ShipmentServiceError(message, 409);
