export function readRoute(hash) {
  const [screen, query = ''] = hash.replace(/^#\/?/, '').split('?');
  if (screen === 'clients') return query.includes('new=1') ? { screen: 'clients', newClient: true } : { screen: 'clients' };
  if (screen === 'filing') {
    const params = new URLSearchParams(query);
    const month = Number(params.get('month'));
    const year = Number(params.get('year'));
    const clientId = params.get('client');
    if (clientId && Number.isInteger(month) && month >= 1 && month <= 12 &&
      Number.isInteger(year) && year >= 2000 && year <= 9999) {
      return { screen, clientId, month, year };
    }
  }
  return { screen: 'dashboard' };
}

export function routeHash(route) {
  if (route.screen === 'filing') {
    return `#/filing?${new URLSearchParams({ client: route.clientId, month: route.month, year: route.year })}`;
  }
  return route.screen === 'clients' ? `#/clients${route.newClient ? '?new=1' : ''}` : '#/dashboard';
}
