/**
 * What a person may be told about a database failure.
 *
 * The inventory functions raise their refusals as plain sentences written for
 * the person ("A vendor named X already exists.") with a small set of error
 * codes. Anything else -- a foreign-key or syntax error, a deadlock, a timeout
 * -- carries schema and constraint names and is never shown. A length check is
 * not enough: "insert or update on table "inventory_stock" violates foreign
 * key constraint ..." is short.
 */

/** Codes the inventory functions raise with an authored message. */
const AUTHORED_CODES = new Set(["22023", "23505", "23514", "42501", "PT409"]);

/** Native Postgres text that can share those codes (a unique or check violation). */
const NATIVE_TEXT =
  /violates|constraint|relation "|table "|column "|schema "|function |syntax|deadlock|timeout|permission denied|duplicate key|invalid input|out of range|violation/i;

export const GENERIC_FAILURE = "That didn't work. Please try again.";

export function friendlyDbMessage(error: {
  message?: string;
  code?: string;
}): string {
  const { message, code } = error;
  if (
    message &&
    message.length < 200 &&
    code !== undefined &&
    AUTHORED_CODES.has(code) &&
    !NATIVE_TEXT.test(message)
  ) {
    return message;
  }
  return GENERIC_FAILURE;
}
