/**
 * CSV field codec shared by the writer and the reader of `planning/tasks.csv`.
 *
 * `@planmo/generator` writes the file and `@planmo/trace` reads it, so both use
 * these two functions — a title containing a comma is quoted on write and must
 * not split on read. Splitting on a bare `,` would silently turn a five-column
 * row into six and make a valid workspace fail validation.
 */

/** Quote a field per RFC 4180 when it contains a delimiter, quote or newline. */
export function csvField(value: string): string {
  return /[",\n\r]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

/**
 * Split one CSV line into fields, honouring RFC 4180 double quotes: a quoted
 * field may contain commas, and `""` inside it is a literal quote.
 *
 * Line endings are the caller's concern — call this per line.
 */
export function splitCsvLine(line: string): string[] {
  const fields: string[] = [];
  let current = '';
  let quoted = false;

  for (let index = 0; index < line.length; index++) {
    const char = line[index];
    if (quoted) {
      if (char === '"') {
        if (line[index + 1] === '"') {
          current += '"';
          index++;
        } else {
          quoted = false;
        }
      } else {
        current += char;
      }
    } else if (char === '"') {
      quoted = true;
    } else if (char === ',') {
      fields.push(current);
      current = '';
    } else {
      current += char;
    }
  }

  fields.push(current);
  return fields;
}
