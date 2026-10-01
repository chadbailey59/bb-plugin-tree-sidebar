// Undoing the padding an earlier version of this plugin put on project names.
//
// bb's project picker used to be indented by padding the names themselves, which
// meant renaming every project and showing that padding anywhere bb printed a
// name. `projectMenu.ts` indents the picker's rows directly instead, so the
// padding is only ever removed now — but names already carrying it have to be
// cleaned up, and a user who never had it must not be touched.
//
// The pad was NO-BREAK SPACE, never a plain space, so stripping it cannot eat a
// leading space somebody typed themselves.

/** Whatever the name was before any indent was added to it. */
export function baseName(name: string): string {
  return name.replace(/^\u00a0+/u, "");
}

/** Whether a name already carries an indent. */
export function isIndented(name: string): boolean {
  return name !== baseName(name);
}
