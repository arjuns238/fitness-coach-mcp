/** Bad input the caller can fix (invalid date, range too long, unknown timezone). */
export class InputError extends Error {}

/** No entry with the requested id. */
export class NotFoundError extends Error {}
