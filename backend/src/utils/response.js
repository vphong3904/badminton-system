const camel = (o) => {
  if (Array.isArray(o)) return o.map(camel);
  if (o && typeof o === 'object')
    return Object.fromEntries(Object.entries(o).map(([k, v]) => [k[0].toLowerCase() + k.slice(1), camel(v)]));
  return o;
};
exports.ok = (res, data, meta) => res.json({ success: true, data: camel(data), ...(meta && { meta }) });
exports.created = (res, data) => res.status(201).json({ success: true, data: camel(data) });
exports.noContent = (res) => res.status(204).end();