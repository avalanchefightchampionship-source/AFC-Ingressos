const normalizeCodigo = (codigo) => {
  if (typeof codigo !== 'string') return '';
  return codigo.trim().toUpperCase();
};

export const formatCodigoIngressoParaExibicao = (codigo) => {
  const normalized = normalizeCodigo(codigo);
  if (!normalized) return '';

  const prefix = normalized.startsWith('AFC-') ? 'AFC-' : '';
  const token = normalized.replace(/^AFC-?/, '');
  const compactToken = token.replace(/[^A-Z0-9]/g, '');

  if (!compactToken) return normalized;

  const groups = compactToken.match(/.{1,4}/g) || [];
  const visibleGroups = groups.slice(0, 3);

  if (visibleGroups.length === 0) return normalized;
  return `${prefix}${visibleGroups.join('-')}`;
};
