// SPH implementation, MIT (see ../../../../LICENSE).
// Classify ESTree names by their syntactic role, without executing the AST.
function reference(node, parent, modern = false) {
  let current = node;
  while (current?.type === 'MemberExpression') {
    if (current.computed) return false;
    parent = current;
    current = current.object;
  }
  if (current?.type !== 'Identifier') return false;
  if (!parent) return true;
  const role = parent.type;
  const member = role === 'MemberExpression';
  if (member) return Boolean(parent.computed || parent.object === current);
  if (role === 'MethodDefinition') return Boolean(parent.computed);
  if (role === 'Property' || role === (modern ? 'PropertyDefinition' : 'FieldDefinition')) {
    return Boolean(parent.computed || parent.value === current);
  }
  if (role === 'ImportSpecifier' || role === 'ExportSpecifier') return parent.local === current;
  if (modern && role === 'MetaProperty') return parent.meta === current;
  return !new Set(['LabeledStatement', 'ContinueStatement', 'BreakStatement']).has(role);
}
function getLocator(text, options = {}) {
  const starts = [0];
  for (let position = 0; position < text.length; position++) {
    if (text.charCodeAt(position) === 10) starts.push(position + 1);
  }
  return (needle, from = 0) => {
    const position = typeof needle === 'string' ? text.indexOf(needle, from) : needle;
    if (!Number.isInteger(position) || position < 0 || position > text.length) return undefined;
    let left = 0, right = starts.length;
    while (left + 1 < right) {
      const middle = Math.floor((left + right) / 2);
      if (starts[middle] <= position) left = middle;
      else right = middle;
    }
    return { line: left + (options.offsetLine ?? 0), column: position - starts[left] + (options.offsetColumn ?? 0), character: position };
  };
}
function locate(text, needle, options) { return getLocator(text, options)(needle, options?.startIndex); }
module.exports = { reference, getLocator, locate };
